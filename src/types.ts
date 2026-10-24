// Values the middleware stores on each request (read with c.get(...)).
export type Role = "read" | "admin";

export type AppEnv = {
  Variables: {
    requestId: string;
    role: Role;
  };
};
