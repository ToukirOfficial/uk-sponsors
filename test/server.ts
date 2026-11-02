import { createServer, type RequestListener, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeServer {
  origin: string;
  close: () => Promise<void>;
}

/** A local HTTP server standing in for GOV.UK. Tests never touch the real internet. */
export async function startServer(handler: RequestListener): Promise<FakeServer> {
  const server: Server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
}

export function contentApi(csvUrl: string, extra: Record<string, unknown> = {}): unknown {
  return {
    base_path: "/government/publications/register-of-licensed-sponsors-workers",
    public_updated_at: "2026-11-02T08:39:02+00:00",
    details: {
      attachments: [
        {
          attachment_type: "file",
          content_type: "text/csv",
          file_size: 10943210,
          filename: "SP_-_Worker_and_Temporary_Worker_Web_Register_-_2026-11-02.csv",
          title: "Register of Worker and Temporary Worker licensed sponsors",
          url: csvUrl,
        },
      ],
    },
    ...extra,
  };
}
