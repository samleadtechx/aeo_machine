import { NextResponse } from "next/server";
import { apiError, requireAdminApi } from "@/lib/auth/api";
import { prisma } from "@/lib/prisma";
import { canonicalArticleUrl } from "@/lib/utils/url";
import { publishArticle } from "@/modules/articles/service";
import { deployBuild } from "@/modules/deployments/service";
import { buildBlogStaticSite } from "@/modules/rendering/site-renderer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  let article;
  try {
    article = await publishArticle(id);
  } catch (error) {
    return apiError(error);
  }

  const articleWithBlog = await prisma.article.findUniqueOrThrow({
    where: { id },
    include: { blog: { select: { baseUrl: true } } },
  });
  const target = await prisma.deploymentTarget.findFirst({
    where: { blogId: articleWithBlog.blogId },
    orderBy: { createdAt: "desc" },
  });
  const articleUrl = canonicalArticleUrl(articleWithBlog.blog.baseUrl, articleWithBlog.slug, target?.cleanUrlMode !== "HTML");
  if (!body.deploy) {
    return NextResponse.json({ article, articleUrl });
  }

  let build;
  try {
    build = await buildBlogStaticSite(articleWithBlog.blogId, "ARTICLE_PUBLISH");
  } catch (error) {
    return stageError("build", error, { article, articleUrl }, 500);
  }

  try {
    const deployment = await deployBuild(build.id, {
      publicVerifications: [{ url: articleUrl, expectedText: articleWithBlog.title }],
    });
    return NextResponse.json({ article, articleUrl, build, deployment });
  } catch (error) {
    return stageError("deploy", error, { article, articleUrl, build }, 502);
  }
}

function stageError(stage: "build" | "deploy", error: unknown, payload: Record<string, unknown>, status: number) {
  const detail = error instanceof Error ? error.message : "Request failed";
  return NextResponse.json(
    {
      ...payload,
      stage,
      error: stage === "deploy" ? `Article is published, but FTP/SFTP upload failed: ${detail}` : `Article is published, but static build failed: ${detail}`,
    },
    { status }
  );
}
