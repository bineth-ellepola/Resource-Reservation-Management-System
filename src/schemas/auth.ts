import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  // Not trimmed: spaces are valid password characters. The max length bounds bcrypt work.
  password: z.string().min(1, "Enter your password.").max(200, "Password is too long."),
});

export type LoginInput = z.infer<typeof loginSchema>;
