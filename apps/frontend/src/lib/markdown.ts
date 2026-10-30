import MarkdownIt from 'markdown-it';

// Raw HTML stays escaped and unsafe link schemes are dropped: note files can come from anywhere.
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

export const renderMarkdown = (text: string) => md.render(text);

/** The text Markdown renders to, without its marks: for one line of a list. */
export const markdownText = (text: string) =>
	new DOMParser().parseFromString(md.render(text), 'text/html').body.textContent?.trim() ?? '';
