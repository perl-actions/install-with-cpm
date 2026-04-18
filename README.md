[![Actions Status](https://github.com/perl-actions/install-with-cpm/workflows/check/badge.svg)](https://github.com/perl-actions/install-with-cpm/actions) [![Lint javascript](https://github.com/perl-actions/i
nstall-with-cpm/actions/workflows/lint-javascript.yml/badge.svg)](https://github.com/perl-actions/install-with-cpm/actions/workflows/lint-javascript.yml)

# install-with-cpm

GitHub action to install Perl modules using [App::cpm](https://github.com/skaji/cpm)

This action installs 'cpm' as root so you can then use it in your workflow.

```yaml
- name: install cpm and multiple modules
  uses: perl-actions/install-with-cpm@v2
  with:
    install: |
      Simple::Accessor
      Test::Parallel

# or you can use a cpanfile
#     cpanfile: 'your-cpanfile'
# default values you can customize
#     sudo: true
#     version: main
# where to install cpm
#     path: "$Config{installsitescript}/cpm"
# which perl binary to use
#     perl: 'perl'
```

## Using install-with-cpm in a GitHub workflow

Here is a sample integration using `install-with-cpm` action
to test your Perl Modules using multiple Perl versions via the
`perl-tester` images and the action `perl-actions/perl-versions` to rely on a dynamic list of available Perl versions.

```yaml
# .github/workflows/linux.yml
jobs:

  perl-versions:
    runs-on: ubuntu-latest
    name: List Perl versions
    outputs:
      perl-versions: ${{ steps.action.outputs.perl-versions }}
    steps:
      - id: action
        uses: perl-actions/perl-versions@v2
        with:
          since-perl: v5.10
          with-devel: false

  perl_tester:
    runs-on: ubuntu-latest
    name: "Perl ${{ matrix.perl-version }}"
    needs: [perl-versions]

    strategy:
      fail-fast: false
      matrix:
        perl-version: ${{ fromJson(needs.perl-versions.outputs.perl-versions) }}

    container: perldocker/perl-tester:${{ matrix.perl-version }}

    steps:
      - uses: actions/checkout@v6
      - name: uses install-with-cpm
        uses: perl-actions/install-with-cpm@v2
        with:
          cpanfile: "cpanfile"
          sudo: false
      - run: perl Makefile.PL
      - run: make test
```

## Compatibility

This action uses the **Node.js 24** GitHub Actions runtime (`node24`).
Both `@stable` and `@v2` point to the current Node.js 24 version.

## Inputs

### `install`

List of one or more modules, separated by a newline `\n` character.

### `cpanfile`

Install modules from a cpanfile.

### `tests`

Boolean variable used to disable unit tests during installation
Possible values: true | false [default: false]

### `global`

Boolean variable used to install or not modules to @INC instead of local.
This variable controls the `-g` option from cpm and is enabled by default.

Possible values: true | false [default: true]

### `args`

Extra arguments to pass to the cpm command line.

You can also use this option to run your own flavor
without the need of setting `install` or `cpanfile`.
```yaml
args: "--installdeps ."
```

### `sudo`

Run commands as sudo: true | false [default: true]

### `perl`

Which perl path to use. Default to use `perl` from the current `PATH`.

### `path`

Where to install `cpm`. Default value is `$Config{installsitescript}/cpm`.

### `verbose`

Boolean variable used to control the `-v` flag
Possible values: true | false [default: false]

Note: this was previously set to true by default,
this is now disabled to speedup installations.

### `workers`

Number of parallel workers for cpm downloads (e.g. `5`).
When set, passes `--workers N` to cpm, enabling parallel module downloads.
This can significantly speed up installation of large cpanfiles.
By default this is empty, which lets cpm use its own default.

```yaml
- name: install with parallel downloads
  uses: perl-actions/install-with-cpm@v2
  with:
    cpanfile: "cpanfile"
    workers: 5
```

### `mirror`

Specify a CPAN mirror URL. When set, `--mirror <url>` is appended to the cpm command.

```yaml
mirror: "https://cpan.metacpan.org/"
```

### `snapshot`

Path to a `cpanfile.snapshot` for snapshot-based installs. Requires `Carton::Snapshot` to be installed.
By default this is empty, which disables cpm's automatic snapshot detection.
This prevents the common CI failure when `cpanfile.snapshot` exists in the repo but `Carton::Snapshot` is not available.

```yaml
# To use snapshot-based resolution:
snapshot: "cpanfile.snapshot"
```

### `version`

Which version/tag of `cpm` to install. Default is 'main' to use the latest version.

## Caching

The action caches the downloaded `cpm` script using [`@actions/cache`](https://github.com/actions/toolkit/tree/main/packages/cache)
to avoid re-downloading it on every run.

**How it works:**

- **Immutable versions** (semver tags like `0.997014`, or commit SHAs): the cache key is fixed, so the script is downloaded once and reused indefinitely.
- **Mutable refs** (branch names like `main`): the cache key includes the current UTC date, so the script is re-downloaded at most once per day. This ensures you always get recent updates without downloading on every run.

Cache operations are best-effort — if the cache is unavailable (e.g., on self-hosted runners without cache support), the action falls back to downloading directly. Cache failures never cause the action to fail.

The cache key format is: `cpm-script-{version}-{platform}[-{date}]`

## Outputs

### `cpm-path`

Absolute path where cpm was installed. Useful for referencing cpm in subsequent steps.

### `cache-hit`

`"true"` if the cpm script was restored from cache, `"false"` if it was freshly downloaded.

## Example usage

### Using outputs

```yaml
- name: install cpm
  id: cpm
  uses: perl-actions/install-with-cpm@v2
  with:
    install: "Simple::Accessor"
- name: show cpm path
  run: echo "cpm installed at ${{ steps.cpm.outputs.cpm-path }}"
```

### Install cpm

Just install cpm without running any install commands.
You can then use cpm yourself in order commands.

```yaml
- name: install cpm
  uses: perl-actions/install-with-cpm@v2
# then you can use it
- run: "sudo cpm install -g Simple::Accessor"
```

### Install an older version of cpm

Just install cpm without running any install commands.
You can then use cpm yourself in order commands.

```yaml
- name: install cpm
  uses: perl-actions/install-with-cpm@v2
  with:
    version: "0.990"
```

### Install a single module

```yaml
- name: install cpm and one module
  uses: perl-actions/install-with-cpm@v2
  with:
    install: "Simple::Accessor"
```

### Install multiple modules

List modules separated by a newline character `\n`

```yaml
- name: install cpm and multiple modules
  uses: perl-actions/install-with-cpm@v2
  with:
    install: |
      Simple::Accessor
      Test::Parallel
```

### Install modules from a cpanfile

```yaml
- name: install cpm and files from cpanfile
  uses: perl-actions/install-with-cpm@v2
  with:
    cpanfile: "your-cpanfile"
```

### Install a module and enable tests

Install modules with tests.

```yaml
- name: install cpm and files from cpanfile
  uses: perl-actions/install-with-cpm@v2
  with:
    install: "Simple::Accessor"
    tests: true
```

### Install module(s) to local directory

Disable the `-g` flag.

```yaml
- name: install cpm and files from cpanfile
  uses: perl-actions/install-with-cpm@v2
  with:
    install: "Simple::Accessor"
    global: false
    sudo: false
```

### Use some custom args to install

```yaml
- name: "install cpm + cpanfile with args"
  uses: perl-actions/install-with-cpm@v2
  with:
    cpanfile: "your-cpanfile"
    args: "--with-recommends --with-suggests"
```

Here is an extract of the possible args to use to control groups
```
        --with-requires,   --without-requires   (default: with)
        --with-recommends, --without-recommends (default: without)
        --with-suggests,   --without-suggests   (default: without)
        --with-configure,  --without-configure  (default: without)
        --with-build,      --without-build      (default: with)
        --with-test,       --without-test       (default: with)
        --with-runtime,    --without-runtime    (default: with)
        --with-develop,    --without-develop    (default: without)
```

### Using install-with-cpm on Windows / win32

Here is a sample job using cpm to install modules on Windows.
Strawberry Perl is pre-installed on `windows-latest` runners.

```yaml
windows:
  runs-on: windows-latest
  name: "windows"

  steps:
    - run: perl -V

    - uses: actions/checkout@v6
    - name: "install-with-cpm"
      uses: perl-actions/install-with-cpm@v2
      with:
        install: |
          abbreviation
          ACH
    # checking that both modules are installed
    - run: perl -Mabbreviation -e1
    - run: perl -MACH -e1
```
