declare global {
  namespace Express {
    interface User {
      id?: string;
      email?: string;
      spotifyId?: string;
      [key: string]: any;
    }

    interface Request {
      user?: User;
    }
  }
}

export {};
