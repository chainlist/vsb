import MarkdownIt from 'markdown-it';
import { openLink } from '#lib/api.js';
import { isMod } from '#lib/keys.js';

// Raw HTML stays escaped and unsafe link schemes are dropped: note files can come from anywhere.
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

export const renderMarkdown = (text: string) => md.render(text);

/** One line of Markdown, with no paragraph around it: a mindmap node's title. */
export const renderInline = (text: string) => md.renderInline(text);

/** Links render, but following one would navigate the whole app away: Ctrl+click opens it outside
 * the app instead, as on a link card. For a click on rendered Markdown. */
export function blockLinks(e: MouseEvent) {
	const link = (e.target as Element).closest('a');
	if (!link) return;
	e.preventDefault();
	if (isMod(e)) void openLink(link.getAttribute('href') ?? '');
}

/** The text Markdown renders to, without its marks: for one line of a list. */
export const markdownText = (text: string) =>
	new DOMParser().parseFromString(md.render(text), 'text/html').body.textContent?.trim() ?? '';
