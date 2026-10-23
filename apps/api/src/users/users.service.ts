import { Injectable } from '@nestjs/common';
import { UserDirectory } from './user-directory.js';

const MAX_SUGGESTIONS = 8;

/** Who a User can pick from when sharing: any other User of the realm. */
@Injectable()
export class UsersService {
  constructor(private readonly directory: UserDirectory) {}

  /** Usernames starting with `text`, without the caller (a Share with oneself is rejected anyway). */
  async suggest(caller: string, text: string): Promise<string[]> {
    // One extra, so dropping the caller still leaves a full list.
    const found = await this.directory.search(text, MAX_SUGGESTIONS + 1);
    return found.filter((name) => name !== caller).slice(0, MAX_SUGGESTIONS);
  }
}
