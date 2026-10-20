/**
 * Shared input validation.
 *
 * Usernames: 6–20 characters, letters and numbers ONLY — no special
 * characters, no leading/trailing whitespace tricks. Uniqueness is enforced
 * server-side (profiles.js isUsernameTaken, strict fail-closed + DB unique
 * index), but every client that writes a username re-checks format here so
 * users get immediate feedback and spoofed clients are rejected at the API.
 *
 * Avatars: PNG or JPEG only (user request — nothing else gets read or
 * uploaded), capped at 1MB because avatars are stored inline as base64.
 */

export const USERNAME_PATTERN = /^[A-Za-z0-9]{6,20}$/;

export const USERNAME_RULES_TEXT = 'Usernames are 6–20 letters or numbers — no special characters.';

export function isValidUsername(value) {
    return USERNAME_PATTERN.test(String(value || '').trim());
}

// Format errors before any network call: returns a human message or null.
export function usernameFormatError(value) {
    const v = String(value || '').trim();
    if (!v) return 'Choose a username.';
    if (v.length < 6) return 'Usernames must be at least 6 characters.';
    if (v.length > 20) return 'Usernames must be at most 20 characters.';
    if (!/^[A-Za-z0-9]+$/.test(v)) return 'Letters and numbers only — no special characters.';
    return null;
}

export const AVATAR_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];
export const AVATAR_MAX_BYTES = 1024 * 1024; // 1MB

// Returns an error string for disallowed avatar files, or null when the file
// is a PNG/JPEG inside the size cap. Checks the file header (magic bytes) as
// the second line of defense so a renamed .exe or .gif can't sneak past a
// spoofed MIME type.
export function avatarFileError(file) {
    if (!file) return 'No file selected.';
    if (!AVATAR_TYPES.includes(String(file.type || '').toLowerCase())) {
        return 'Only PNG or JPEG images are allowed.';
    }
    if (file.size > AVATAR_MAX_BYTES) return 'Image too large (Max 1MB).';
    return null;
}

// Reads the first bytes of the file and confirms the browser-reported type
// matches the real encoding. Returns Promise<error | null>.
export async function avatarFileValid(file) {
    const fErr = avatarFileError(file);
    if (fErr) return fErr;
    try {
        const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
        const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
        const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
        if (!isJpeg && !isPng) return 'That file is not a real PNG or JPEG image.';
        return null;
    } catch {
        return 'Could not read that image file.';
    }
}
