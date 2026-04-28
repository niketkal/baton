class Baton < Formula
  desc "CLI-first task-state runtime for AI coding tools"
  homepage "https://baton.dev"
  url "https://registry.npmjs.org/@baton/cli/-/cli-VERSION.tgz"
  sha256 "GENERATED_AT_RELEASE"
  license "Apache-2.0"
  depends_on "node@20"

  def install
    system "npm", "install", "--global", "--prefix=#{libexec}", buildpath/"@baton/cli-#{version}.tgz"
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/baton --version")
  end
end
