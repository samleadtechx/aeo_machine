import { NextResponse } from "next/server";
import { apiError, requireAdminApi } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { deploymentTargetInputSchema } from "@/lib/validation/blogs";
import { testDeploymentConnection, testDeploymentTarget } from "@/modules/deployments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  try {
    const { id: blogId } = await params;
    const body = await request.json().catch(() => ({}));
    if (body.deploymentTarget) {
      const target = deploymentTargetInputSchema.parse(body.deploymentTarget);
      const savedTarget = await prisma.deploymentTarget.findFirst({
        where: { blogId },
        orderBy: { createdAt: "desc" },
      });
      const connectionTarget = {
        ...target,
        passwordEncrypted: target.password ? undefined : savedTarget?.passwordEncrypted,
        privateKeyEncrypted: target.privateKey ? undefined : savedTarget?.privateKeyEncrypted,
        privateKeyPassphraseEncrypted: target.privateKeyPassphrase ? undefined : savedTarget?.privateKeyPassphraseEncrypted,
      };
      await testDeploymentConnection(connectionTarget);
      return NextResponse.json({
        ok: true,
        target: { ...target, password: undefined, privateKey: undefined, privateKeyPassphrase: undefined },
        reusedSavedCredentials: {
          password: !target.password && Boolean(savedTarget?.passwordEncrypted),
          privateKey: !target.privateKey && Boolean(savedTarget?.privateKeyEncrypted),
          privateKeyPassphrase: !target.privateKeyPassphrase && Boolean(savedTarget?.privateKeyPassphraseEncrypted),
        },
      });
    }

    const target = await prisma.deploymentTarget.findFirst({
      where: { blogId },
      orderBy: { createdAt: "desc" },
    });
    if (!target) {
      throw new Error("No deployment target is saved for this blog yet. Enter FTP/SFTP details on the Blogs page and click Test, or save the target first.");
    }
    return NextResponse.json({ target: await testDeploymentTarget(target.id) });
  } catch (error) {
    return apiError(error);
  }
}
