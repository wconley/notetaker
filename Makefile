.PHONY : all themes configs

all: themes configs

THEMES := $(wildcard theme/*.hjson)
CONFIGS := $(wildcard config/*.hjson)

themes: $(THEMES:.hjson=.json)

configs: $(CONFIGS:.hjson=.json)

theme/%.json : theme/%.hjson
	hjson -c $< > $@

config/%.json : config/%.hjson
	hjson -j $< > $@

