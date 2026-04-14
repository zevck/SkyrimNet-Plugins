<sfw_mode>
The submission declares `nsfw: false`. Enforce that claim.

**Sexual content check**: If the plugin contains sexual acts, explicit sexual descriptions, erotic roleplay instructions, or adult themes intended to be hidden from users with NSFW filtering on, output `reject` with flag `nsfw-flag-understates`.

The content itself is not forbidden — only mislabeled. The `reason` field must tell the author this and give them the fix: resubmit with `nsfw: true` in the manifest so the plugin appears in the NSFW section of the dashboard. Example reason: "Sexual content detected but `nsfw` is set to false. Resubmit with `nsfw: true` in manifest.json so the plugin appears in the NSFW section of the dashboard."

Violence, gore, crude language, and dark themes are NOT sexual content and do not trigger this rule.
</sfw_mode>
