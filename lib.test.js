const path = require("path");
const os = require("os");

// Mock @actions/* packages before requiring lib
jest.mock("@actions/core");
jest.mock("@actions/tool-cache");
jest.mock("@actions/exec");
jest.mock("@actions/io");

const core = require("@actions/core");
const tc = require("@actions/tool-cache");
const exec = require("@actions/exec");
const io = require("@actions/io");

const lib = require("./lib");

beforeEach(() => {
    jest.clearAllMocks();
    core.info.mockImplementation(() => {});
    core.getInput.mockImplementation(() => "");
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
        lib.set_perl("/usr/bin/perl");

        const result = await lib.install_cpm_location();

        expect(exec.exec).toHaveBeenCalledWith(
            "/usr/bin/perl",
            ["-MConfig", "-e", 'print "$Config{installsitescript}/cpm"'],
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
        lib.set_perl("/usr/bin/perl");

        const result = await lib.install_cpm("/usr/local/bin/cpm");

        expect(tc.downloadTool).toHaveBeenCalledWith(
            "https://raw.githubusercontent.com/skaji/cpm/main/cpm"
        );
        expect(exec.exec).toHaveBeenCalled();
        expect(result).toBe("/usr/local/bin/cpm");
    });

    test("uses io.cp on win32", async () => {
        core.getInput.mockImplementation((name) => {
            if (name === "version") return "main";
            return "";
        });
        tc.downloadTool.mockResolvedValue("/tmp/cpm-downloaded");
        io.cp.mockResolvedValue();
        jest.spyOn(os, "platform").mockReturnValue("win32");

        await lib.install_cpm("/usr/local/bin/cpm");

        expect(io.cp).toHaveBeenCalledWith(
            "/tmp/cpm-downloaded",
            "/usr/local/bin/cpm"
        );
    });
});

describe("run", () => {
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
});
