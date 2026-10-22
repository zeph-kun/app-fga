import { Global, Module } from '@nestjs/common';
import { DocumentRepository } from '../documents/document-repository.js';
import { PrismaDocumentRepository } from '../documents/prisma-document-repository.js';
import { FolderRepository } from '../folders/folder-repository.js';
import { PrismaFolderRepository } from '../folders/prisma-folder-repository.js';
import { TeamRepository } from '../teams/team-repository.js';
import { PrismaTeamRepository } from '../teams/prisma-team-repository.js';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [
    PrismaService,
    {
      provide: DocumentRepository,
      useFactory: (prisma: PrismaService) => new PrismaDocumentRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: FolderRepository,
      useFactory: (prisma: PrismaService) => new PrismaFolderRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: TeamRepository,
      useFactory: (prisma: PrismaService) => new PrismaTeamRepository(prisma),
      inject: [PrismaService],
    },
  ],
  exports: [DocumentRepository, FolderRepository, TeamRepository],
})
export class DatabaseModule {}
