import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateRoleDto {
  @IsOptional()
  @IsString({ message: 'Key must be a string' })
  @Length(2, 50, { message: 'Key must be between 2 and 50 characters' })
  key?: string;

  @IsOptional()
  @IsString({ message: 'Name must be a string' })
  @Length(2, 100, { message: 'Name must be between 2 and 100 characters' })
  name?: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @Length(3, 300, {
    message: 'Description must be between 3 and 300 characters',
  })
  description?: string;
}
