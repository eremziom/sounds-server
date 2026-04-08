import { NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { UsersService } from './users.service'
import { UpdateUserDto } from './update-user.dto'
import { users } from '../mockup/users.mock'

const seedUsers = users.map((user) => ({ ...user }))
const resetUsers = () => {
  users.length = 0
  users.push(...seedUsers.map((user) => ({ ...user })))
}

describe('UsersService', () => {
  let service: UsersService

  beforeEach(async () => {
    resetUsers()
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService],
    }).compile()

    service = module.get<UsersService>(UsersService)
  })

  it('returns all users', () => {
    expect(service.findAll()).toHaveLength(seedUsers.length)
  })

  it('finds a user by id', () => {
    const user = service.findOne(1)
    expect(user.id).toBe(1)
  })

  it('throws when user is missing', () => {
    expect(() => service.findOne(999)).toThrow(NotFoundException)
  })

  it('updates only provided fields', () => {
    const payload: Partial<UpdateUserDto> = { bio: 'Updated bio' }
    const updated = service.update(1, payload)
    expect(updated.bio).toBe('Updated bio')
    expect(updated.username).toBe(seedUsers[0].username)
    expect((updated as any).password).toBeUndefined()
  })

  it('throws when update target missing', () => {
    expect(() => service.update(999, { username: 'missing' })).toThrow(NotFoundException)
  })

  it('removes a user by id', () => {
    service.remove(2)
    expect(service.findAll()).toHaveLength(seedUsers.length - 1)
  })

  it('throws when removing non-existing user', () => {
    expect(() => service.remove(999)).toThrow(NotFoundException)
  })
})
