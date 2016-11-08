# Random notes about things in the development
Probably out of date, too :)


clippy and cargo-check error if used outside of a cargo crate.
Maybe I can find out if cargo-check needs the '--lib' argument by running it without args on a dummy crate included in the extension?
I should probably have an 'autoupdate tools' option, since EVERYTHING IS BROKEN!. 
Actually, the autoupdate would probably want to use fixed versions, but something akin to 'update to the latest versions supported by Cogs'.
Should I just install tools separately from the user? (Then have user-supplied tools be 'opt-in' instead?)

# Possible todos
- Make a tool (in rust) to run clippy/check and output JSON (potentially converting human-readable output)
- Add support for outputting in the new JSON format in rust-clippy
