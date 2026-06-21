import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = "Tutto.Azienda <noreply@tuttoa.com>";

export async function sendInviteEmail(params: {
  to: string;
  tenantName: string;
  inviterName: string;
  inviteUrl: string;
}) {
  return resend.emails.send({
    from: FROM,
    to: params.to,
    subject: `Sei stato invitato in ${params.tenantName}`,
    html: `
      <p>Ciao,</p>
      <p><strong>${params.inviterName}</strong> ti ha invitato a unirti all'azienda <strong>${params.tenantName}</strong> su Tutto.Azienda.</p>
      <p><a href="${params.inviteUrl}">Accetta l'invito</a></p>
    `,
  });
}

export async function sendPasswordResetEmail(params: { to: string; resetUrl: string }) {
  return resend.emails.send({
    from: FROM,
    to: params.to,
    subject: "Reimposta la tua password",
    html: `
      <p>Hai richiesto il reset della password.</p>
      <p><a href="${params.resetUrl}">Reimposta password</a></p>
      <p>Il link scade tra 1 ora. Se non hai fatto tu questa richiesta, ignora questa email.</p>
    `,
  });
}
