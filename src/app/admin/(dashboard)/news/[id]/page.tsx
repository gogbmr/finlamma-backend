import { Newspaper } from "lucide-react";
import { notFound } from "next/navigation";
import { Forbidden } from "@/components/admin/forbidden";
import { PageHeader } from "@/components/admin/page-header";
import { getStaffMember } from "@/lib/auth";
import { roleHasPermission } from "@/server/staff/repo";
import { getStoryDetailForAdmin } from "@/server/news/admin-queries";
import { listActiveTopicsForPicker } from "@/server/topics/service";
import { NewsView } from "../news-view";

export default async function NewsStoryViewPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await getStaffMember();
  if (!staff) {
    return <Forbidden message="Staff sign-in required." />;
  }

  const canView = await roleHasPermission(staff.roleId, "news.view");
  if (!canView) {
    return <Forbidden message="You don't have permission to use the News Desk." />;
  }

  const { id } = await params;
  const [story, topics] = await Promise.all([
    getStoryDetailForAdmin(id),
    listActiveTopicsForPicker(),
  ]);
  if (!story) notFound();

  const topicName = topics.find((t) => t.id === story.topicId)?.name.en ?? "No topic";

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "News Desk", href: "/admin/news" },
          { label: story.content.headline.en || "(untitled)" },
        ]}
        icon={Newspaper}
        title={story.content.headline.en || "(untitled)"}
        description="Read-only view. Status, topic and quality-grade override are edited inline from the News Desk pipeline table."
      />

      <NewsView
        story={{
          id: story.id,
          category: story.category,
          impact: story.impact,
          content: story.content,
          jargon: story.jargon ?? null,
          outlet: story.outlet,
          sourceUrl: story.sourceUrl,
          qualityGrade: story.qualityGrade,
          qualityGradeOverride: story.qualityGradeOverride,
          featured: story.featured,
          adviceLikeWarnings: story.adviceLikeWarnings,
          status: story.status,
          topicName,
          publishedAt: story.publishedAt,
        }}
      />
    </div>
  );
}
