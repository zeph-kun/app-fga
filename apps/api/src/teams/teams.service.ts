import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Membership } from '../authorization/membership.js';
import { ResourceLifecycle } from '../lifecycle/resource-lifecycle.js';
import { UserDirectory } from '../users/user-directory.js';
import type { Team } from './team.js';
import { TeamRepository } from './team-repository.js';

export interface CreateTeamInput {
  readonly name: string;
}

/** A team together with its members and the requester's role on it. */
export interface TeamView extends Team {
  readonly role: 'owner' | 'member';
  readonly members: string[];
}

/**
 * Teams and the rules about who can manage them. Who belongs to a Team lives
 * in the Membership; name and ownership live in the TeamRepository.
 */
@Injectable()
export class TeamsService {
  constructor(
    private readonly membership: Membership,
    private readonly teams: TeamRepository,
    private readonly users: UserDirectory,
    private readonly lifecycle: ResourceLifecycle,
  ) {}

  async create(userId: string, { name }: CreateTeamInput): Promise<Team> {
    const team: Team = { id: randomUUID(), ownerId: userId, name };
    await this.lifecycle.createTeam(team);
    return team;
  }

  async list(userId: string): Promise<Team[]> {
    const [owned, memberOf] = await Promise.all([
      this.teams.findByOwner(userId),
      this.membership.teamsOf(userId).then((ids) => this.teams.findByIds(ids)),
    ]);
    const byId = new Map([...owned, ...memberOf].map((team) => [team.id, team]));
    return [...byId.values()];
  }

  async get(userId: string, id: string): Promise<TeamView> {
    const team = await this.require(userId, id);
    const members = await this.membership.members(id);
    return { ...team, role: team.ownerId === userId ? 'owner' : 'member', members };
  }

  async rename(userId: string, id: string, { name }: CreateTeamInput): Promise<Team> {
    const team = await this.requireOwner(userId, id);
    const renamed: Team = { ...team, name };
    await this.teams.save(renamed);
    return renamed;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.requireOwner(userId, id);
    await this.lifecycle.deleteTeam(id);
  }

  async addMember(userId: string, id: string, target: string): Promise<void> {
    await this.requireOwner(userId, id);
    if (!(await this.users.exists(target))) {
      throw new BadRequestException(`No user named "${target}"`);
    }
    await this.membership.add(id, target);
  }

  async removeMember(userId: string, id: string, target: string): Promise<void> {
    const team = await this.requireOwner(userId, id);
    if (target === team.ownerId) {
      throw new ForbiddenException('The owner cannot be removed from their own team');
    }
    await this.membership.remove(id, target);
  }

  /** 404 for a user who is neither the owner nor a member, so existence is not leaked. */
  private async require(userId: string, id: string): Promise<Team> {
    const team = await this.teams.findById(id);
    const members = team ? await this.membership.members(id) : [];
    if (!team || (team.ownerId !== userId && !members.includes(userId))) {
      throw new NotFoundException('Team not found');
    }
    return team;
  }

  /** Same 404 as `require`, plus 403 for a member who is not the owner. */
  private async requireOwner(userId: string, id: string): Promise<Team> {
    const team = await this.require(userId, id);
    if (team.ownerId !== userId) {
      throw new ForbiddenException('Only the team owner can do this');
    }
    return team;
  }
}
