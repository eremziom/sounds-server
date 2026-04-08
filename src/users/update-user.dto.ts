import { IsOptional, IsString, Length, IsUrl } from 'class-validator'

export class UpdateUserDto {
  @IsOptional()
  @IsString({ message: 'Username must be a string' })
  @Length(3, 30)
  username?: string

  @IsOptional()
  @IsString({ message: 'Bio must be a string' })
  @Length(0, 200)
  bio?: string

  @IsOptional()
  @IsUrl({}, { message: 'Avatar must be a valid URL' })
  avatar?: string
}
