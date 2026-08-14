.PHONY: build-OnlineFunction build-MoveFunction build-WsConnectFunction

build-OnlineFunction build-MoveFunction:
	esbuild src/http.ts \
		--bundle \
		--platform=node \
		--format=cjs \
		--target=es2022 \
		--outfile=$(ARTIFACTS_DIR)/http.js

build-WsConnectFunction:
	esbuild src/ws.ts \
		--bundle \
		--platform=node \
		--format=cjs \
		--target=es2022 \
		--outfile=$(ARTIFACTS_DIR)/ws.js
