# LIKAS APK download

Place the Android demo APK here:

- `likas.apk`

The landing page download button points to:

```text
/downloads/likas.apk
```

When you export a new Android build, rename it to `likas.apk` and place it in this folder.

or you can use this, if its URL

```
<Reveal delay={0.08} className="lg:col-start-1">
  <a
    href="https://your-cdn-domain.com/downloads/likas.apk"
    download="LIKAS.apk"
    className={buttonVariants({
      size: "lg",
      className:
        "min-h-13 w-full rounded-full bg-[#3bb372] px-5 text-center text-base text-white shadow-xl shadow-emerald-500/25 hover:bg-emerald-700 sm:w-auto",
    })}
  >
    <Download className="mr-2 size-4" />
    Download APK
  </a>
</Reveal>
```
