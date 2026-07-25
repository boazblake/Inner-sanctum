{
  description = "Sanctum React Native development shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
          config.android_sdk.accept_license = true;
        };
        androidComposition = pkgs.androidenv.composeAndroidPackages {
          buildToolsVersions = [ "35.0.0" ];
          platformVersions = [ "35" ];
          cmakeVersions = [ "3.22.1" ];
          includeCmake = true;
          includeNDK = true;
          ndkVersions = [ "27.1.12297006" ];
        };
        androidSdk = androidComposition.androidsdk;
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_22
            jdk17
            android-tools
            androidSdk
            cocoapods
            ruby
            watchman
          ];

          shellHook = ''
            export LANG=en_US.UTF-8
            export LC_ALL=en_US.UTF-8
            export COCOAPODS_DISABLE_STATS=1

            export JAVA_HOME="${pkgs.jdk17.home}"

            export ANDROID_HOME="${androidSdk}/libexec/android-sdk"
            export ANDROID_SDK_ROOT="$ANDROID_HOME"
            export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

            # Put Apple developer tools before Nix wrappers. React Native's
            # glog pod script uses `which xcrun`; if it finds Nix/xcbuild xcrun,
            # SDK lookup fails (`unable to find sdk: iphoneos`) and later Xcode
            # may invoke Nix clang, which rejects `-index-store-path`.
            export PATH="$JAVA_HOME/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

            # React Native iOS builds must use Apple clang from Xcode. Some Nix
            # shells expose LLVM clang first, which does not understand Xcode's
            # `-index-store-path` flag and causes glog/Pods builds to fail.
            if [ -d /Applications/Xcode.app/Contents/Developer ]; then
              export DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer"
              export TOOLCHAINS=com.apple.dt.toolchain.XcodeDefault
              export CC="$DEVELOPER_DIR/Toolchains/XcodeDefault.xctoolchain/usr/bin/clang"
              export CXX="$DEVELOPER_DIR/Toolchains/XcodeDefault.xctoolchain/usr/bin/clang++"
              export LD="$CC"
              export LDPLUSPLUS="$CXX"
              export OBJC="$CC"
              export OBJCXX="$CXX"
              export SDKROOT="$DEVELOPER_DIR/Platforms/iPhoneOS.platform/Developer/SDKs/iPhoneOS.sdk"
            elif [ -d /Applications/Xcode-beta.app/Contents/Developer ]; then
              export DEVELOPER_DIR="/Applications/Xcode-beta.app/Contents/Developer"
              export TOOLCHAINS=com.apple.dt.toolchain.XcodeDefault
              export CC="$DEVELOPER_DIR/Toolchains/XcodeDefault.xctoolchain/usr/bin/clang"
              export CXX="$DEVELOPER_DIR/Toolchains/XcodeDefault.xctoolchain/usr/bin/clang++"
              export LD="$CC"
              export LDPLUSPLUS="$CXX"
              export OBJC="$CC"
              export OBJCXX="$CXX"
              export SDKROOT="$DEVELOPER_DIR/Platforms/iPhoneOS.platform/Developer/SDKs/iPhoneOS.sdk"
            elif /usr/bin/xcrun --find clang >/dev/null 2>&1; then
              export DEVELOPER_DIR="$(/usr/bin/xcode-select -p)"
              export TOOLCHAINS=com.apple.dt.toolchain.XcodeDefault
              export CC="$(/usr/bin/xcrun --find clang)"
              export CXX="$(/usr/bin/xcrun --find clang++)"
              export LD="$CC"
              export LDPLUSPLUS="$CXX"
              export OBJC="$CC"
              export OBJCXX="$CXX"
            fi

            echo "Sanctum native dev shell: node $(node --version), java $(java -version 2>&1 | head -n 1), pod $(pod --version), xcrun $(which xcrun), android $ANDROID_HOME, developer $DEVELOPER_DIR, cc $CC, ld $LD"
          '';
        };
      });
}
