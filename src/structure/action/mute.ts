import { GuildMember, Message } from 'discord.js';
import { CaseModel, Case } from '../../model/case';
import { DocumentType } from '@typegoose/typegoose';
import { CaseType } from '../../util/constants';
import { MessageEmbed } from 'discord.js';
import truncate from 'truncate';
import humanizeDuration from 'humanize-duration';
import { MinehutClient } from '../../client/minehutClient';
import { prettyDate } from '../../util/util';
import { guildConfigs } from '../../guild/guildConfigs';
import { Action } from './action';

interface MuteActionData {
	target: GuildMember;
	moderator: GuildMember;
	reason?: string;
	message?: Message;
	duration: number;
	client: MinehutClient;
}

export class MuteAction extends Action {
	target: GuildMember;
	moderator: GuildMember;
	message?: Message;
	reason: string;
	duration: number;
	expiresAt: Date;
	document?: DocumentType<Case>;
	client: MinehutClient;

	constructor(data: MuteActionData) {
		super();
		this.target = data.target;
		this.moderator = data.moderator;
		this.message = data.message;
		this.reason = truncate(data.reason || 'No reason provided', 2000);
		this.duration = data.duration;
		this.expiresAt = new Date(Date.now() + this.duration);
		this.client = data.client;
	}

	async commit() {
		// To execute the action and the after method
		if (!this.target.manageable) return;
		// Make previous mutes inactive
		await CaseModel.updateMany(
			{
				guildId: this.target.guild!.id,
				active: true,
				type: CaseType.Mute,
				targetId: this.target.id,
			},
			{ active: false }
		);
		const muteRole = guildConfigs.get(this.target.guild!.id)?.roles.muted;
		if (!muteRole) return;
		await this.sendTargetDm();
		this.document = await CaseModel.create({
			_id: this.id,
			active: true,
			moderatorId: this.moderator.id,
			moderatorTag: this.moderator.user.tag,
			targetId: this.target.id,
			targetTag: this.target.user.tag,
			expiresAt: this.expiresAt,
			reason: this.reason,
			guildId: this.target.guild.id,
			type: CaseType.Mute,
		} as Case);
		await this.target.roles.add(muteRole, `[#${this.id}] ${this.reason}`);
		await this.after();
	}

	async after() {
		// To log the action
		if (!this.document) return;
		// TODO: add mod log thingy
		console.log(`mod log stuff, ${this.document.toString()}`);
		await this.client.muteScheduler.refresh();
	}

	async sendTargetDm() {
		try {
			if (this.target.id === this.target.client.user?.id) return; // The bot can't message itself
			const embed = new MessageEmbed()
				.setColor('RED')
				.setDescription('**You have been muted on Minehut!**')
				.addField('ID', this.id, true)
				.addField('Reason', this.reason, true)
				.addField('Duration', humanizeDuration(this.duration, { largest: 3 }))
				.addField('Expires', prettyDate(this.expiresAt))
				.setTimestamp();
			await this.target.send(embed);
		} catch (err) {}
	}
}
