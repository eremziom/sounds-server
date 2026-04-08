import { NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { UsersController } from './users.controller'
import { UsersModule } from './users.module'
import { UpdateUserDto } from './update-user.dto'
import { users } from '../mockup/users.mock'

const seedUsers = users.map((user) => ({ ...user }))
const resetUsers = () => {
  users.length = 0
  users.push(...seedUsers.map((user) => ({ ...user })))
}

describe('UsersController', () => {
  let controller: UsersController

  beforeEach(async () => {
    resetUsers()
    const module: TestingModule = await Test.createTestingModule({
      imports: [UsersModule],
    }).compile()

    controller = module.get<UsersController>(UsersController)
  })

  it('returns list of users', () => {
    expect(controller.findAll()).toHaveLength(seedUsers.length)
  })

  it('returns a user by id', () => {
    const user = controller.findOne(1)
    expect(user.id).toBe(1)
  })

  it('updates a user with only provided fields', () => {
    const dto: UpdateUserDto = { username: 'updated-name' }
    const updated = controller.update(1, dto)
    expect(updated.username).toBe('updated-name')
    expect((updated as any).password).toBeUndefined()
  })

  it('removes a user by id', () => {
    controller.remove(2)
    expect(controller.findAll()).toHaveLength(seedUsers.length - 1)
  })

  it('throws when user missing', () => {
    expect(() => controller.findOne(999)).toThrow(NotFoundException)
  })
})
