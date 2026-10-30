// The download page: asks GitHub for the latest release and lists its installers by platform, with
// a button for the visitor's own. Until there is a release it says so; the browser and the source
// stay offered below either way.
const repo = document.body.dataset.repo;

/** What each file of a release is, by the name Tauri's bundler gives it. Files that match none
 * (signatures, updater archives) are left out. The first match wins. */
const KINDS = [
	{ os: 'windows', name: 'Installer (.exe)', test: /\.exe$/i },
	{ os: 'windows', name: 'Installer (.msi)', test: /\.msi$/i },
	{ os: 'macos', name: 'Apple silicon (.dmg)', test: /(aarch64|arm64).*\.dmg$/i },
	{ os: 'macos', name: 'Intel (.dmg)', test: /(x64|x86_64).*\.dmg$/i },
	{ os: 'macos', name: 'Universal (.dmg)', test: /\.dmg$/i },
	{ os: 'linux', name: 'AppImage', test: /\.AppImage$/i },
	{ os: 'linux', name: 'Debian and Ubuntu (.deb)', test: /\.deb$/i },
	{ os: 'linux', name: 'Fedora and openSUSE (.rpm)', test: /\.rpm$/i }
];
const OS_NAMES = { windows: 'Windows', macos: 'macOS', linux: 'Linux' };

/** The visitor's desktop system, or null on a phone, a tablet or anything else. */
function visitorOs() {
	const agent = navigator.userAgent;
	if (/android|iphone|ipad/i.test(agent)) return null;
	if (/windows/i.test(agent)) return 'windows';
	// An iPad asks for the desktop site as a Mac would, but has a touch screen.
	if (/mac os/i.test(agent)) return navigator.maxTouchPoints > 1 ? null : 'macos';
	if (/linux/i.test(agent)) return 'linux';
	return null;
}

function show(state) {
	for (const el of document.querySelectorAll('[data-state]')) el.hidden = el.dataset.state !== state;
}

const megabytes = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;

async function latest() {
	const answer = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
		headers: { Accept: 'application/vnd.github+json' }
	});
	if (answer.status === 404) return null;
	if (!answer.ok) throw new Error(`GitHub answered ${answer.status}`);
	return answer.json();
}

try {
	const release = await latest();
	const files = (release?.assets ?? []).flatMap((asset) => {
		const kind = KINDS.find((k) => k.test.test(asset.name));
		return kind ? [{ ...kind, url: asset.browser_download_url, size: asset.size, file: asset.name }] : [];
	});
	if (!files.length) show('none');
	else {
		const template = document.getElementById('file');
		for (const card of document.querySelectorAll('.platforms [data-os]')) {
			const list = card.querySelector('.files');
			const mine = files.filter((f) => f.os === card.dataset.os);
			for (const f of mine) {
				const item = template.content.cloneNode(true);
				Object.assign(item.querySelector('a'), { href: f.url, textContent: f.name, title: f.file });
				item.querySelector('.size').textContent = megabytes(f.size);
				list.append(item);
			}
			if (!mine.length) list.replaceWith(Object.assign(document.createElement('p'), { textContent: 'Not in this release.' }));
		}
		const os = visitorOs();
		const best = files.find((f) => f.os === os);
		if (best) {
			const button = document.querySelector('[data-slot="best"]');
			Object.assign(button, { href: best.url, textContent: `Download for ${OS_NAMES[os]}`, hidden: false });
		}
		const released = new Intl.DateTimeFormat('en', { dateStyle: 'long' }).format(new Date(release.published_at));
		document.querySelector('[data-slot="version"]').textContent = `${release.name || release.tag_name}, released ${released}.`;
		document.querySelector('[data-slot="notes"]').href = release.html_url;
		show('found');
	}
} catch {
	show('failed');
}
