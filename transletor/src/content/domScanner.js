function scanTranslatableText(root = document.body) {
	const excluded = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'SVG', 'INPUT', 'SELECT', 'OPTION']);
	const result = [];
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let node;
	while ((node = walker.nextNode())) {
		const parent = node.parentElement;
		if (!parent || excluded.has(parent.tagName) || parent.closest('[hidden], [aria-hidden="true"], [data-no-translate], [data-swt-controller]')) continue;
		const text = node.nodeValue.replace(/\s+/g, ' ').trim();
		if (text.length >= 3 && /\p{L}/u.test(text)) result.push(node);
	}
	return result;
}