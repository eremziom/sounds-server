import { IsString, Matches } from 'class-validator';

export class RefreshTokenDto {
  @IsString()
  @Matches(/^[a-f0-9]{64}$/, { message: 'Invalid refresh token format' })
  refreshToken!: string;
}
