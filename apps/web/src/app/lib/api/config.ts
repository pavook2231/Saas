export const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api')
  .replace(/\/$/, '');

export const apiOrigin = apiBaseUrl.replace(/\/api$/, '');
