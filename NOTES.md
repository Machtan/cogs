# Random notes about things in the development
Probably out of date, too :)


clippy and cargo-check error if used outside of a cargo crate.
Maybe I can find out if cargo-check needs the '--lib' argument by running it without args on a dummy crate included in the extension?
I should probably have an 'autoupdate tools' option, since EVERYTHING IS BROKEN!. 
Actually, the autoupdate would probably want to use fixed versions, but something akin to 'update to the latest versions supported by Cogs'.
Should I just install tools separately from the user? (Then have user-supplied tools be 'opt-in' instead?)

# Child-process
It seems that instead of launching a new shell instance (thus running the bash/fish/whatevs init), it just copies the environment from when it was launched.

# Finding the rust source code for Racer
The newest racer (at least) looks RUST\_SRC\_PATH => rustup\_src\_path => /usr/(somethingsomething)
So it looks like racer can find it on its own. Maybe I should just run it once and check the output for the 'could not find RUST\_SRC\_PATH' message.

Option #1: *RUST\_SRC\_PATH*
Use it if it exists
Otherwise check for rustup-installed rust-src

Perhaps tell the user that rustup might be a better option (if on *nix)
https://github.com/rust-lang-nursery/rustup.rs/#other-installation-methods
rustup component add rust-src
let path = (rustc --print sysroot)/lib/rustlib/src/rust/src

# Possible todos
- Symbol provider / auto-completion (`rustsym + racer`?)
- Support cargo with builtin check (0.16.nightly / something)
  `cargo 0.16.0-nightly (ddb5c32 2016-12-16)` or later?
- Make a tool (in rust) to run clippy/check and output JSON (potentially converting human-readable output)
- Add support for outputting in the new JSON format in rust-clippy?
