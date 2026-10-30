import { validate } from 'class-validator';
import { CreateUserDto } from './create-user.dto';
import { UpdateUserDto } from '../users/update-user.dto';
import { normalizeValidationErrors } from '../common/api-validation.pipe';

describe('Username validation', () => {
  it.each(['a@b', 'name@example.com', '@name', 'name@', 'name@\n'])(
    'rejects %j on registration and rename with a stable error code',
    async (username) => {
      for (const Dto of [CreateUserDto, UpdateUserDto]) {
        const dto = Object.assign(new Dto(), {
          username,
          ...(Dto === CreateUserDto
            ? {
                email: 'valid@example.com',
                password: 'Secret123!',
              }
            : {}),
        });
        expect(normalizeValidationErrors(await validate(dto))).toContainEqual({
          field: 'username',
          code: 'USERNAME_NO_AT',
        });
      }
    },
  );

  it('permits ordinary names and updates that omit username', async () => {
    for (const username of ['Tester', 'some-user', 'żółw']) {
      expect(
        await validate(Object.assign(new UpdateUserDto(), { username })),
      ).toEqual([]);
    }
    expect(await validate(new UpdateUserDto())).toEqual([]);
  });
});
