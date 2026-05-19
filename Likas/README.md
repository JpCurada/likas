# LIKAS — React Native App

This is the [**React Native**](https://reactnative.dev) app for **LIKAS**, the offline-first, AI-powered disaster companion. See the [root README](../README.md) for the project overview and [`docs/kaggle-writeup.md`](../docs/kaggle-writeup.md) for the full technical story.

The on-device AI dispatch loop, GBNF grammar, tool registry, and offline evacuation/routing logic live in [`src/services/`](src/services/). The Gemma 4 Q4_K_M GGUF model is **not committed** — it is downloaded in-app from the Setup screen.

# Getting Started

> **Note**: Make sure you have completed the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

## Step 1: Start Metro

First, you will need to run **Metro**, the JavaScript build tool for React Native.

To start the Metro dev server, run the following command from the root of your React Native project:

```sh
# Using npm
npm start

# OR using Yarn
yarn start
```

## Step 2: Build and run your app

With Metro running, open a new terminal window/pane from the root of your React Native project, and use one of the following commands to build and run your Android or iOS app:

### Android

```sh
# Using npm
npm run android

# OR using Yarn
yarn android
```

### iOS

For iOS, remember to install CocoaPods dependencies (this only needs to be run on first clone or after updating native deps).

The first time you create a new project, run the Ruby bundler to install CocoaPods itself:

```sh
bundle install
```

Then, and every time you update your native dependencies, run:

```sh
bundle exec pod install
```

For more information, please visit [CocoaPods Getting Started guide](https://guides.cocoapods.org/using/getting-started.html).

```sh
# Using npm
npm run ios

# OR using Yarn
yarn ios
```

If everything is set up correctly, you should see your new app running in the Android Emulator, iOS Simulator, or your connected device.

This is one way to run your app — you can also build it directly from Android Studio or Xcode.

## Step 3: Modify your app

Now that you have successfully run the app, let's make changes!

Open `App.tsx` in your text editor of choice and make some changes. When you save, your app will automatically update and reflect these changes — this is powered by [Fast Refresh](https://reactnative.dev/docs/fast-refresh).

When you want to forcefully reload, for example to reset the state of your app, you can perform a full reload:

- **Android**: Press the <kbd>R</kbd> key twice or select **"Reload"** from the **Dev Menu**, accessed via <kbd>Ctrl</kbd> + <kbd>M</kbd> (Windows/Linux) or <kbd>Cmd ⌘</kbd> + <kbd>M</kbd> (macOS).
- **iOS**: Press <kbd>R</kbd> in iOS Simulator.

## Congratulations! :tada:

You've successfully run and modified your React Native App. :partying_face:

### Now what?

- If you want to add this new React Native code to an existing application, check out the [Integration guide](https://reactnative.dev/docs/integration-with-existing-apps).
- If you're curious to learn more about React Native, check out the [docs](https://reactnative.dev/docs/getting-started).

### Assets (Maps, Protocols, OSM data & Fonts)

This project bundles its offline data in [`assets/`](assets/): disaster protocols (`assets/protocols/`), scraped OSM POIs (`assets/data/scraped/`), Metro Manila + fault-line data (`assets/data/`), and the map style + pre-computed pedestrian graph (`assets/maps/`). These are linked into both the Android and iOS native projects.

After cloning, or whenever you add fonts or map data, link the assets natively:

```sh
npm run prepare-assets   # downloads glyphs, links Android, runs react-native-asset
# or, to only re-link without re-fetching fonts:
npm run link-assets
```

Note: The generated native assets in `android/app/src/main/assets/` are gitignored to prevent repository bloat. Only the source files in `Likas/assets/` are tracked. The Gemma 4 GGUF model is also not committed — it is fetched in-app.

# Troubleshooting

If you're having issues getting the above steps to work, see the [Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.

# Learn More

To learn more about React Native, take a look at the following resources:

- [React Native Website](https://reactnative.dev) - learn more about React Native.
- [Getting Started](https://reactnative.dev/docs/environment-setup) - an **overview** of React Native and how setup your environment.
- [Learn the Basics](https://reactnative.dev/docs/getting-started) - a **guided tour** of the React Native **basics**.
- [Blog](https://reactnative.dev/blog) - read the latest official React Native **Blog** posts.
- [`@facebook/react-native`](https://github.com/facebook/react-native) - the Open Source; GitHub **repository** for React Native.
