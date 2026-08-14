.PHONY: build-OnlineFunction

build-OnlineFunction:
	esbuild src/http.ts \
		--bundle \
		--platform=node \
		--format=cjs \
		--target=es2022 \
		--outfile=$(ARTIFACTS_DIR)/http.js
