import MarkdownIt from 'markdown-it';

// Raw HTML stays escaped and unsafe link schemes are dropped: note files can come from anywhere.
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

export const renderMarkdown = (text: string) => md.render(text);
