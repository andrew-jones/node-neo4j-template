// ingredients.js
// Routes to CRUD ingredients.

var URL = require('url');

var errors = require('../models/errors');
var Ingredient = require('../models/ingredient');

function getIngredientURL(ingredient) {
    return '/ingredients/' + encodeURIComponent(ingredient.name);
}

/**
 * GET /ingredients
 */
exports.list = function (req, res, next) {
    Ingredient.getAll(function (err, ingredients) {
        if (err) return next(err);
        res.render('ingredients', {
            Ingredient: Ingredient,
            ingredients: ingredients,
            name: req.query.name,   // Support pre-filling create form
            error: req.query.error,     // Errors creating; see create route
        });
    });
};

/**
 * POST /ingredients {name, ...}
 */
exports.create = function (req, res, next) {
    Ingredient.create({
        name: req.body.name
    }, function (err, ingredient) {
        if (err) {
            if (err instanceof errors.ValidationError) {
                // Return to the create form and show the error message.
                // TODO: Assuming name is the issue; hardcoding for that
                // being the only input right now.
                // TODO: It'd be better to use a cookie to "remember" this info,
                // e.g. using a flash session.
                return res.redirect(URL.format({
                    pathname: '/ingredients',
                    query: {
                        name: req.body.name,
                        error: err.message,
                    },
                }));
            } else {
                return next(err);
            }
        }
        res.redirect(getIngredientURL(ingredient));
    });
};

/**
 * GET /ingredients/:name
 */
exports.show = function (req, res, next) {
    Ingredient.get(req.params.name, function (err, ingredient) {
        // TODO: Gracefully "no such ingredient" error. E.g. 404 page.
        if (err) return next(err);
        // TODO: Also fetch and show followers? (Not just follow*ing*.)
        ingredient.getFollowingAndOthers(function (err, following, others) {
            if (err) return next(err);
            res.render('ingredient', {
                Ingredient: Ingredient,
                ingredient: ingredient,
                following: following,
                others: others,
                name: req.query.name,   // Support pre-filling edit form
                error: req.query.error,     // Errors editing; see edit route
            });
        });
    });
};

/**
 * POST /ingredients/:name {name, ...}
 */
exports.edit = function (req, res, next) {
    Ingredient.get(req.params.name, function (err, ingredient) {
        // TODO: Gracefully "no such ingredient" error. E.g. 404 page.
        if (err) return next(err);
        ingredient.patch(req.body, function (err) {
            if (err) {
                if (err instanceof errors.ValidationError) {
                    // Return to the edit form and show the error message.
                    // TODO: Assuming name is the issue; hardcoding for that
                    // being the only input right now.
                    // TODO: It'd be better to use a cookie to "remember" this
                    // info, e.g. using a flash session.
                    return res.redirect(URL.format({
                        pathname: getIngredientURL(ingredient),
                        query: {
                            name: req.body.name,
                            error: err.message,
                        },
                    }));
                } else {
                    return next(err);
                }
            }
            res.redirect(getIngredientURL(ingredient));
        });
    });
};

/**
 * DELETE /ingredients/:name
 */
exports.del = function (req, res, next) {
    Ingredient.get(req.params.name, function (err, ingredient) {
        // TODO: Gracefully handle "no such ingredient" error somehow.
        // E.g. redirect back to /ingredients with an info message?
        if (err) return next(err);
        ingredient.del(function (err) {
            if (err) return next(err);
            res.redirect('/ingredients');
        });
    });
};

/**
 * POST /ingredients/:name/follow {otherIngredientname}
 */
exports.follow = function (req, res, next) {
    Ingredient.get(req.params.name, function (err, ingredient) {
        // TODO: Gracefully handle "no such ingredient" error somehow.
        // This is the source ingredient, so e.g. 404 page?
        if (err) return next(err);
        Ingredient.get(req.body.otherIngredientname, function (err, other) {
            // TODO: Gracefully handle "no such ingredient" error somehow.
            // This is the target ingredient, so redirect back to the source ingredient w/
            // an info message?
            if (err) return next(err);
            ingredient.follow(other, function (err) {
                if (err) return next(err);
                res.redirect(getIngredientURL(ingredient));
            });
        });
    });
};

/**
 * POST /ingredients/:name/unfollow {otherIngredientname}
 */
exports.unfollow = function (req, res, next) {
    Ingredient.get(req.params.name, function (err, ingredient) {
        // TODO: Gracefully handle "no such ingredient" error somehow.
        // This is the source ingredient, so e.g. 404 page?
        if (err) return next(err);
        Ingredient.get(req.body.otherIngredientname, function (err, other) {
            // TODO: Gracefully handle "no such ingredient" error somehow.
            // This is the target ingredient, so redirect back to the source ingredient w/
            // an info message?
            if (err) return next(err);
            ingredient.unfollow(other, function (err) {
                if (err) return next(err);
                res.redirect(getIngredientURL(ingredient));
            });
        });
    });
};
