import { Test, TestingModule } from '@nestjs/testing'
import { TracksController } from './tracks.controller'
import { TracksModule } from './tracks.module'

describe('TracksController', () => {
  let controller: TracksController

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [TracksModule],
    }).compile()

    controller = module.get<TracksController>(TracksController)
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })
})