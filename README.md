Android Project Generator

This app generates a ready‑to‑use Android project from a template. It downloads a modern Android template (Jetpack Compose + Hilt) from a GitHub repository, replaces placeholders with the user’s project name and package, and creates a shareable ZIP file.

✨ Features

· One‑click generation – Enter project name and package, then download and process the template.
· Progress feedback – Shows download percentage and generation status.
· Share result – Once generated, the ZIP can be shared via any installed app (email, cloud, etc.).
· Offline ready – Uses Android’s built‑in DownloadManager; survives app restarts.
· Modern stack – Jetpack Compose, Material 3, Hilt, Kotlin Coroutines, Flow, and FileProvider.

📦 Architecture

The app follows a single‑activity pattern with Jetpack Compose navigation. The main components:

· MainActivity – Hosts the Compose UI and handles the share intent from the ViewModel.
· NavigationHost – Defines the app’s navigation graph (only the home screen for now).
· HomeDestination – Encapsulates the home screen route and provides the HomeScreen with a ViewModel.
· HomeScreen – Displays the form, progress, and share button.
· HomeViewModel – Orchestrates download, generation, and sharing; holds UI state.
· TemplateDownloader – Uses DownloadManager to fetch the template ZIP from a URL.
· ProjectGenerator – Extracts the ZIP, replaces placeholders, and creates a final ZIP file.
· Application – A minimal application class (optional).

🗂️ File Structure

```
app/
├── src/main/
│   ├── java/com/renamecompanyname/renameappname/
│   │   ├── Application.kt                      // (Optional) App class
│   │   ├── generator/
│   │   │   ├── ProjectGenerator.kt             // Extracts, replaces, zips
│   │   │   └── TemplateDownloader.kt           // Downloads template
│   │   ├── presentation/
│   │   │   └── home/
│   │   │       └── HomeViewModel.kt            // ViewModel for the home screen
│   │   ├── ui/
│   │   │   ├── MainActivity.kt                 // Single activity
│   │   │   ├── home/
│   │   │   │   └── HomeScreen.kt               // Composable UI
│   │   │   ├── navigation/
│   │   │   │   ├── NavigationHost.kt           // NavHost definition
│   │   │   │   └── destinations/
│   │   │   │       └── home/
│   │   │   │           └── homeDestination.kt  // Home route and composable
│   │   │   └── theme/                          // Material 3 theme
│   │   └── ... (other packages removed)
│   ├── res/
│   │   ├── xml/
│   │   │   └── file_paths.xml                  // FileProvider paths for sharing
│   │   └── ... (other resources)
│   └── AndroidManifest.xml                     // Internet permission + FileProvider
└── build.gradle (module)                        // Dependencies and Java 17
```

🧩 What Was Removed / Changed

We started from the modern-android-template-quick-start and made the following changes to turn it into a project generator:

· Removed MongoDB / Realm – All references to MongoDB dependencies and plugins were removed. The associated code (data layer, repositories, use cases) was deleted.
· Removed Profile feature – Deleted the profile screen and its ViewModel, navigation, and any related code.
· Removed FAB logic – Removed floating action button callbacks from MainActivity, NavigationHost, and all screen destinations.
· Updated Java version – Changed sourceCompatibility and targetCompatibility to Java 17, and jvmTarget to "17".
· Simplified BaseViewModel – Replaced it with direct StateFlow in HomeViewModel to avoid inheritance.
· Added generator logic – Implemented TemplateDownloader and ProjectGenerator.
· Added FileProvider – Configured in AndroidManifest.xml and added file_paths.xml for sharing.
· Added Internet permission – Required for downloading the template.

🚀 How to Use

1. Run the app on an emulator or device.
2. Enter a project name (e.g., MyAwesomeApp).
3. Enter a package name (e.g., com.example.myawesomeapp).
4. Tap Generate Project. The app will:
   · Download the template from the configured URL.
   · Extract it.
   · Replace {{PACKAGE_NAME}} and {{APP_NAME}} placeholders with your input.
   · Zip the processed project.
5. Once done, a Share button appears. Tap it to share the generated ZIP.

🛠️ Dependencies (from libs.versions.toml)

· AndroidX Core KTX – 1.15.0
· Lifecycle Runtime KTX – 2.8.7
· Hilt – 2.55
· Compose BOM – 2025.02.00
· Compose Navigation – 2.8.8
· Kotlin Serialization – 1.7.3
· Coil – 3.0.4
· Play In‑App Updates / Reviews – for future expansion
· Ktor – for future networking (if needed)

All other dependencies (MongoDB, Room, etc.) were removed.

📝 Configuration

Template URL

The template is currently hard‑coded in HomeViewModel.kt:

```kotlin
private val templateUrl = "https://github.com/PimDhaen/modern-android-template-quick-start/archive/refs/heads/main.zip"
```

You can change this to any GitHub repository ZIP URL. For the placeholder replacement to work, the template must contain {{PACKAGE_NAME}} and {{APP_NAME}} placeholders. You can fork the original template and modify it accordingly.

FileProvider

The share intent uses a FileProvider with authority ${applicationId}.fileprovider. The file_paths.xml grants access to files in the app’s cache and external cache directories. No further configuration is needed.

🔧 Future Improvements

· Better placeholder replacement – Use a more robust method (e.g., regex) to replace the original package name even if placeholders are not present.
· Custom template URL – Let the user input a custom template URL.
· Progress dialog – Show a modal while generating.
· Error handling – Add retry and clearer error messages.
· Offline support – Cache the last downloaded template.
· Generate directly – Allow the app to create the project without sharing (e.g., save to Downloads).

📜 License

This project is licensed under the MIT License – see the LICENSE file for details.

🤝 Contributing

Feel free to open issues or pull requests. The goal is to keep the app simple and focused on generating Android projects from modern templates.

---

This README was generated to help future developers understand the project structure and decisions made during its creation.