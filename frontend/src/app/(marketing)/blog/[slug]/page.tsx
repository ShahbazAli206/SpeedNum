import { ArrowLeft, ArrowRight, Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Breadcrumbs, CtaBand, Eyebrow, Section } from "@/components/marketing/section";
import { Reveal } from "@/components/reveal";
import { POSTS_SORTED, POST_BY_SLUG } from "@/lib/content/blog";

export function generateStaticParams() {
  return POSTS_SORTED.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const post = POST_BY_SLUG.get(slug);
  if (!post) return { title: "Post not found" };

  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: { title: post.title, description: post.excerpt, type: "article" },
  };
}

export default async function BlogPostPage({ params }: PageProps<"/blog/[slug]">) {
  const { slug } = await params;
  const post = POST_BY_SLUG.get(slug);
  if (!post) notFound();

  const index = POSTS_SORTED.findIndex((item) => item.slug === post.slug);
  const previous = index > 0 ? POSTS_SORTED[index - 1] : null;
  const next = index < POSTS_SORTED.length - 1 ? POSTS_SORTED[index + 1] : null;

  return (
    <>
      <article>
        <header className="hero-wash relative overflow-hidden">
          <div className="grid-lines pointer-events-none absolute inset-0" aria-hidden />
          <div className="relative mx-auto max-w-3xl px-4 pt-10 pb-14 sm:px-6 lg:px-8">
            <Breadcrumbs
              trail={[
                { label: "Home", href: "/" },
                { label: "Blog", href: "/blog" },
                { label: post.category },
              ]}
            />
            <Reveal>
              <Eyebrow>{post.category}</Eyebrow>
            </Reveal>
            <Reveal delay={70}>
              <h1 className="mt-5 text-[2rem] leading-[1.15] font-extrabold tracking-tight text-balance text-ink sm:text-[2.6rem]">
                {post.title}
              </h1>
            </Reveal>
            <Reveal delay={130}>
              <p className="mt-5 text-[17px] leading-relaxed text-pretty text-muted">
                {post.excerpt}
              </p>
            </Reveal>
            <Reveal delay={190}>
              <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-5 text-[13px] text-muted">
                <span className="font-semibold text-ink-soft">{post.author.name}</span>
                <span>{post.author.role}</span>
                <span className="flex items-center gap-1.5">
                  <Clock className="size-3.5" />
                  {post.date} · {post.readMinutes} min read
                </span>
              </div>
            </Reveal>
          </div>
        </header>

        <Section className="pt-14">
          <div className="prose-legal mx-auto max-w-3xl">
            {post.sections.map((section, sectionIndex) => (
              <Reveal key={section.heading ?? sectionIndex} delay={sectionIndex * 40}>
                <div>
                  {section.heading ? <h2>{section.heading}</h2> : null}
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph.slice(0, 48)}>{paragraph}</p>
                  ))}
                  {section.bullets ? (
                    <ul>
                      {section.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </Reveal>
            ))}
          </div>
        </Section>
      </article>

      {/* Prev / next */}
      <Section className="pt-0">
        <nav
          className="mx-auto grid max-w-3xl gap-4 border-t border-line pt-8 sm:grid-cols-2"
          aria-label="More posts"
        >
          {previous ? (
            <Link
              href={`/blog/${previous.slug}`}
              className="group rounded-xl border border-line bg-surface p-5 transition hover:border-brand/35 hover:shadow-[var(--shadow-lift)]"
            >
              <span className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
                <ArrowLeft className="size-3.5" />
                Previous
              </span>
              <span className="mt-2 block text-[14.5px] font-bold text-ink group-hover:text-brand">
                {previous.title}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={`/blog/${next.slug}`}
              className="group rounded-xl border border-line bg-surface p-5 text-right transition hover:border-brand/35 hover:shadow-[var(--shadow-lift)]"
            >
              <span className="flex items-center justify-end gap-1.5 text-[12px] font-semibold text-muted">
                Next
                <ArrowRight className="size-3.5" />
              </span>
              <span className="mt-2 block text-[14.5px] font-bold text-ink group-hover:text-brand">
                {next.title}
              </span>
            </Link>
          ) : null}
        </nav>
      </Section>

      <CtaBand />
    </>
  );
}
