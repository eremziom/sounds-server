import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { TracksModule } from './tracks/tracks.module'
import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { PrismaModule } from './prisma/prisma.module'
import { ConfigModule } from '@nestjs/config'

@Module({
  imports: [TracksModule, AuthModule, UsersModule, PrismaModule, ConfigModule.forRoot({
      isGlobal: true,
    })],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
