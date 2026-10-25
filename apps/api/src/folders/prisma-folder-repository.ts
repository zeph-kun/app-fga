import type { PrismaClient } from '../generated/prisma/client.js';
import type { Folder } from './folder.js';
import { FolderRepository } from './folder-repository.js';

/** Postgres adapter, through Prisma. */
export class PrismaFolderRepository extends FolderRepository {
  constructor(private readonly prisma: PrismaClient) {
    super();
  }

  override async save({ id, ownerId, name, parentId }: Folder): Promise<void> {
    await this.prisma.folder.upsert({
      where: { id },
      create: { id, ownerId, name, parentId },
      update: { name, parentId },
    });
  }

  override async findById(id: string): Promise<Folder | undefined> {
    const row = await this.prisma.folder.findUnique({ where: { id } });
    return row ? toFolder(row) : undefined;
  }

  override async findByIds(ids: readonly string[]): Promise<Folder[]> {
    const rows = await this.prisma.folder.findMany({ where: { id: { in: [...ids] } } });
    return rows.map(toFolder);
  }

  override async findByParent(parentId: string): Promise<Folder[]> {
    return (await this.prisma.folder.findMany({ where: { parentId } })).map(toFolder);
  }

  override async findAll(): Promise<Folder[]> {
    return (await this.prisma.folder.findMany()).map(toFolder);
  }

  override async delete(id: string): Promise<void> {
    await this.prisma.folder.deleteMany({ where: { id } });
  }
}

function toFolder({ id, ownerId, name, parentId }: Folder): Folder {
  return { id, ownerId, name, parentId };
}
