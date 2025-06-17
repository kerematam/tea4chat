class CookieJar {
    private cookies: Map<string, string> = new Map();

    setCookie(setCookieHeader: string) {
        // Parse Set-Cookie header
        const parts = setCookieHeader.split(';');
        const cookiePart = parts[0];
        if (cookiePart) {
            const [name, value] = cookiePart.split('=');
            if (name && value) {
                this.cookies.set(name.trim(), value.trim());
            }
        }
    }

    getCookieHeader(): string {
        const cookieEntries = Array.from(this.cookies.entries());
        return cookieEntries.map(([name, value]) => `${name}=${value}`).join('; ');
    }

    clear() {
        this.cookies.clear();
    }
}

export default CookieJar;