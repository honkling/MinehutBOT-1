import { CaseModel, Case } from '../../model/case';
import { CaseType } from '../../util/constants';
import { MessageEmbed } from 'discord.js';
import humanizeDuration from 'humanize-duration';
import { prettyDate } from '../../util/util';
import { Action, ActionData } from './action';
import { User } from 'discord.js';

type BanActionData = {
	days?: number;
	target: User;
	duration: number;
} & ActionData;

export class BanAction extends Action {
	target: User;
	days: number;
	duration: number;
	expiresAt: Date;

	constructor(data: BanActionData) {
		super({
			guild: data.guild,
			reason: data.reason,
			client: data.client,
			moderator: data.moderator,
		});
		this.target = data.target;
		this.days = data.days || 0;
		this.duration = data.duration;
		this.expiresAt = new Date(Date.now() + this.duration);
	}

	async commit() {
		// To execute the action and the after method
		const member = this.guild.member(this.target);
		if (member && !member.bannable) return;

		// Make previous bans inactive
		await CaseModel.updateMany(
			{
				guildId: this.guild.id,
				active: true,
				$or: [{ type: CaseType.Ban }, { type: CaseType.ForceBan }],
				targetId: this.target.id,
			},
			{ active: false }
		);

		await this.sendTargetDm();
		await this.guild.members.ban(this.target, {
			reason: `[#${this.id}] ${this.reason}`,
			days: this.days,
		});
		this.document = await CaseModel.create({
			_id: this.id,
			active: true,
			moderatorId: this.moderator.id,
			moderatorTag: this.moderator.user.tag,
			targetId: this.target.id,
			targetTag: this.target.tag,
			expiresAt: this.expiresAt,
			reason: this.reason,
			guildId: this.guild.id,
			type: CaseType.Ban,
		} as Case);
		await this.client.banScheduler.refresh();
		await this.after();
	}

	async sendTargetDm() {
		try {
			if (this.target.id === this.target.client.user?.id) return; // The bot can't message itself
			const embed = new MessageEmbed()
				.setColor('RED')
				.setDescription('**You have been banned from Minehut!**')
				.addField('ID', this.id, true)
				.addField('Reason', this.reason, true)
				.addField(
					'Duration',
					humanizeDuration(this.duration, { largest: 3, round: true })
				)
				.addField('Expires', prettyDate(this.expiresAt))
				.setTimestamp();
			await this.target.send(embed);
		} catch (err) {}
	}
}
