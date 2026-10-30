export function authSession(overrides = {}) {
  return {
    accessToken: "header.payload.signature",
    refreshToken: "a".repeat(64),
    accessTokenExpiresAt: new Date(Date.now() + 900000).toISOString(),
    refreshTokenExpiresAt: new Date(Date.now() + 86400000).toISOString(),
    user: {
      id: 1,
      username: "User",
      email: "user@example.com",
      isActive: true,
      roles: [{ key: "USER" }],
    },
    ...overrides,
  };
}
