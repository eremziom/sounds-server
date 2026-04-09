import { Injectable, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor() {
    console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL)
    console.log('DATABASE_URL value:', process.env.DATABASE_URL)

    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
    })

    super({ adapter })
  }

  async onModuleInit() {
    await this.$connect()
  }
}