[![Actions Status](https://github.com/perl-actions/install-with-cpm/workflows/check/badge.svg)](https://github.com/perl-actions/install-with-cpm/actions)

# install-with-cpm

GitHub action to install Perl modules using [App::cpm](https://github.com/skaji/cpm)

This action installs 'cpm' as root so you can then use it in your workflow.

```yaml
- name: install cpm and multiple modules
  uses: perl-actions/install-with-cpm@v1.2
  with:
    install: |
      Simple::Accessor
      Test::Parallel

# or you can use a cpanfile
#     cpanfile: 'your-cpanfile'
# default values you can customize
#     sudo: true
#     version: master
# where to install cpm
#     path: "$Config{installsitescript}/cpm"
# which perl binary to use
#     perl: 'perl'
```

## Using install-with-cpm in a GitHub workflow

Here is a sample integration using install-with-cpm action
to test your Perl Modules using multiple Perl versions via the
perl-tester images.

```yaml
# .github/workflows/linux.yml
jobs:
  perl_tester:
    runs-on: ubuntu-latest
    name: "perl v${{ matrix.perl-version }}"

    strategy:
      fail-fast: false
      matrix:
        perl-version:
          - "5.30"
          - "5.28"
          - "5.26"
        # ...
        # - '5.8'

    container:
      image: perldocker/perl-tester:${{ matrix.perl-version }}

    steps:
      - uses: actions/checkout@v2
      - name: uses install-with-cpm
        uses: perl-actions/install-with-cpm@v1.2
        with:
          cpanfile: "cpanfile"
          sudo: false
      - run: perl Makefile.PL
      - run: make test
```

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

Extra arguments to pass to the cplay command line.

### `sudo`

Run commands as sudo: true | false [default: true]

### `perl`

Which perl path to use. Default to use `perl` from the current `PATH`.

### `path`

Where to install `cpm`. Default value is `$Config{installsitescript}/cpm`.

### `version`

Which version/tag of `cpm` to install. Default is 'master' to use the latest version.

## Outputs

none

## Example usage

### Install cpm

Just install cpm without running any install commands.
You can then use cpm yourself in order commands.

```yaml
- name: install cpm
  uses: perl-actions/install-with-cpm@v1.2
# then you can use it
- run: "sudo cpm install -g Simple::Accessor"
```

### Install an older version of cpm

Just install cpm without running any install commands.
You can then use cpm yourself in order commands.

```yaml
- name: install cpm
  uses: perl-actions/install-with-cpm@v1.2
  with:
    version: "0.990"
```

### Install a single module

```yaml
- name: install cpm and one module
  uses: perl-actions/install-with-cpm@v1.2
  with:
    install: "Simple::Accessor"
```

### Install multiple modules

List modules seperated by a newline character `\n`

```yaml
- name: install cpm and multiple modules
  uses: perl-actions/install-with-cpm@v1.2
  with:
    install: |
      Simple::Accessor
      Test::Parallel
```

### Install modules from a cpanfile

```yaml
- name: install cpm and files from cpanfile
  uses: perl-actions/install-with-cpm@v1.2
  with:
    cpanfile: "your-cpanfile"
```

### Install a module and enable tests

Install modules with tests.

```yaml
- name: install cpm and files from cpanfile
  uses: perl-actions/install-with-cpm@v1.2
  with:
    install: "Simple::Accessor"
    tests: true
```

### Install module(s) to local directory

Disable the `-g` flag.

```yaml
- name: install cpm and files from cpanfile
  uses: perl-actions/install-with-cpm@v1.2
  with:
    install: "Simple::Accessor"
    global: false
    sudo: false
```

### Use some custom args to install

```yaml
- name: "install cpm + cpanfile with args"
  uses: perl-actions/install-with-cpm@v1.2
  with:
    cpanfile: "your-cpanfile"
    args: "--with-recommends --with-suggests"
```

### Using install-with-cpm on Windows / win32

Here is a sample job using cpm to install modules on windows.

```yaml
  windows:
    runs-on: windows-latest
    name: "windows"

    steps:
      - name: Set up Perl
        run: |
          choco install strawberryperl
          echo "##[add-path]C:\strawberry\c\bin;C:\strawberry\perl\site\bin;C:\strawberry\perl\bin"

      - name: perl -V
        run: perl -V

      - uses: actions/checkout@v2
      - name: "install-with-cpm"

        uses: perl-actions/install-with-cpm@v1.2
        with:
          install: |
            abbreviation
            ACH
      # checking that both modules are installed
      - run: perl -Mabbreviation -e1
      - run: perl -MACH -e1
```
