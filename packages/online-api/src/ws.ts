/** WebSocket $connect / $disconnect — accept the socket, write nothing (P16). */
export const handler = (): Promise<{ readonly statusCode: number }> =>
  Promise.resolve({ statusCode: 200 });
