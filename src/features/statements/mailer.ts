import "server-only";

import nodemailer from "nodemailer";

function required(name: string, value: string | undefined) {
  if (!value || !value.trim()) {
    throw new Error(`Missing env ${name}`);
  }
  return value;
}

export async function sendStatementEmail(params: {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | Uint8Array;
    contentType?: string;
  }>;
}) {
  const host = required("SMTP_HOST", process.env.SMTP_HOST);
  const port = Number(process.env.SMTP_PORT ?? "587");
  const secure = String(process.env.SMTP_SECURE ?? "false") === "true";
  const user = required("SMTP_USER", process.env.SMTP_USER);
  const pass = required("SMTP_PASS", process.env.SMTP_PASS);
  const from = required("SMTP_FROM", process.env.SMTP_FROM);

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });

  const info = await transporter.sendMail({
    from,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
    attachments: params.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  });

  return {
    messageId: info.messageId,
  };
}