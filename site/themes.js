// The themes on the home page: a button per theme shows its screenshot, faded in over the others,
// and its note.
const buttons = document.querySelectorAll('.themes button');

for (const button of buttons)
	button.addEventListener('click', () => {
		const picked = (el) => el.dataset.theme === button.dataset.theme;
		for (const b of buttons) b.setAttribute('aria-pressed', String(b === button));
		for (const shot of document.querySelectorAll('.theme-shots > *')) shot.classList.toggle('off', !picked(shot));
		for (const note of document.querySelectorAll('.theme-note')) note.hidden = !picked(note);
	});
