/**
 * Minimal glob matcher for project-relative paths (forward slashes), used by
 * the protected-path and lint-exclusion rules of `.claude/project.json`.
 *
 * Supported syntax, anchored at the project root like .gitignore patterns
 * that contain a slash:
 *   `*`  any characters inside one path segment
 *   `?`  one character inside one path segment
 *   `**` any number of segments; a trailing `/**` matches what is *inside* a
 *        directory, not the directory itself (`dist/**` does not match `dist`)
 *
 * No RegExp is built from the patterns, so a malformed pattern can neither
 * throw nor backtrack catastrophically.
 */

/**
 * @param {string} pattern one segment of a pattern
 * @param {string} text one segment of a path
 */
function matchSegment(pattern, text) {
    let p = 0;
    let t = 0;
    let starP = -1;
    let starT = 0;
    while (t < text.length) {
        if (p < pattern.length && (pattern[p] === '?' || pattern[p] === text[t])) {
            p++;
            t++;
        } else if (p < pattern.length && pattern[p] === '*') {
            starP = p++;
            starT = t;
        } else if (starP !== -1) {
            p = starP + 1;
            t = ++starT;
        } else {
            return false;
        }
    }
    while (pattern[p] === '*') p++;
    return p === pattern.length;
}

/**
 * @param {string[]} patterns
 * @param {string[]} parts
 * @param {number} i
 * @param {number} j
 * @returns {boolean}
 */
function matchSegments(patterns, parts, i, j) {
    if (i === patterns.length) return j === parts.length;
    if (patterns[i] === '**') {
        const first = i === patterns.length - 1 ? j + 1 : j;
        for (let k = first; k <= parts.length; k++) {
            if (matchSegments(patterns, parts, i + 1, k)) return true;
        }
        return false;
    }
    return (
        j < parts.length &&
        matchSegment(patterns[i], parts[j]) &&
        matchSegments(patterns, parts, i + 1, j + 1)
    );
}

/**
 * True when the project-relative `relativePath` matches `pattern`.
 * @param {string} pattern
 * @param {string} relativePath
 */
export function matchGlob(pattern, relativePath) {
    const patterns = pattern.replace(/^\.?\//, '').split('/').filter(Boolean);
    const parts = relativePath.split('/').filter(Boolean);
    return patterns.length > 0 && matchSegments(patterns, parts, 0, 0);
}

/**
 * True when `relativePath` matches any of `patterns`.
 * @param {string[]} patterns
 * @param {string} relativePath
 */
export function matchAny(patterns, relativePath) {
    return patterns.some((pattern) => matchGlob(pattern, relativePath));
}
