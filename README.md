[![Actions Status](https://github.com/perl-actions/install-cpm/workflows/check/badge.svg)](https://github.com/perl-actions/install-cpm/actions)

# install-cpm

GitHub action to install App::cpm

This action installs 'cpm' as root so you can then use it in your workflow.

## Inputs

none

## Outputs

none

## Example usage

```
uses: perl-actions/install-cpm@v1.0
run: |
   sudo cpm install -g Module::To::Install
```