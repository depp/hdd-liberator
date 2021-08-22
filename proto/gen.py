"""Build generated protocol buffer libraries and copy the results into the tree.

This makes tools like IDEs work much better, since they can compile the Go code
without Bazel, or use the Java JARs.
"""
import os
import pathlib
import shutil
import subprocess
import sys

TARGETS = [
    '//proto/compiler:compiler_proto',
]

def die(*msg):
    print('Error:', *msg, file=sys.stderr)
    raise SystemExit(1)

def parse_target(target):
    i = target.find(':')
    if i == -1:
        name = None
        package = target
    else:
        name = target[i+1:]
        package = target[:i]
    assert package.startswith('//')
    package = package[2:]
    assert not package.startswith('/')
    if name is None:
        i = target.rindex('/')
        name = target[i+1:]
    return package, name

def main(argv):
    os.chdir(pathlib.Path(__file__).resolve().parent.parent)
    build_targets = []
    go_srcs = []
    for target in TARGETS:
        package, name = parse_target(target)
        if not name.endswith("_proto"):
            die('Cannot parse proto target name:', repr(target))
        proto_name = name[:-6]
        for suffix in ['java_proto', 'go_proto']:
            build_targets.append(
                '//{}:{}_{}'.format(package, proto_name, suffix))
        go_srcs.append((
            pathlib.Path(
                'bazel-bin',
                package,
                proto_name + '_go_proto_',
                'moria.us',
                'js13k',
                package,
                proto_name + '.pb.go',
            ),
            pathlib.Path(
                package,
                proto_name + '.pb.go',
            ),
        ))
    proc = subprocess.run(['bazel', 'build', '-c', 'opt', *build_targets])
    if proc.returncode:
        die('Failed to build')
    for src, dest in go_srcs:
        dest.parent.mkdir(exist_ok=True)
        shutil.copyfile(src, dest)

if __name__ == '__main__':
    main(sys.argv[1:])
